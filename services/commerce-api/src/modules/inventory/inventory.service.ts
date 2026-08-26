import { Injectable, Logger } from '@nestjs/common';
import type { z } from 'zod';
import type { inventoryAdjustmentSchema, inventoryReceiptSchema, inventoryTransferSchema, stockCountSchema } from '@novamart/validation';
import { AppError } from '../../common/errors/app-error';
import { RequestContext } from '../../common/context/request-context';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';

type ReceiptInput = z.infer<typeof inventoryReceiptSchema>;
type AdjustmentInput = z.infer<typeof inventoryAdjustmentSchema>;
type TransferInput = z.infer<typeof inventoryTransferSchema>;
type StockCountInput = z.infer<typeof stockCountSchema>;

/**
 * Inventory writes (brief §24).
 *
 * Every movement goes through a database function that writes an immutable ledger entry in
 * the same transaction as the balance change. There is deliberately no method here that
 * updates warehouse_inventory directly: the balances are a cache of the ledger, and the
 * reconciliation job exists to catch anyone who bypasses that.
 *
 * Adjustments are maker-checker. A decrease is a write-off of real value, so the person
 * requesting it cannot be the person approving it — enforced by
 * inventory.adjustments_no_self_approval, not just by this code.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxService,
  ) { }

  /**
   * Receives stock into a warehouse.
   *
   * The only movement that increases sellable quantity without an approval step, because
   * it is additive: over-receiving is corrected by an adjustment, and under-receiving
   * simply means less to sell. Both are visible in the ledger.
   */
  async receive(input: ReceiptInput): Promise<{
    availableQuantity: number;
    physicalQuantity: number;
  }> {
    const { sellerId } = await this.assertWarehouseAccess(input.warehouseId);

    // The SKU must be one this seller actually lists, otherwise a seller could inflate
    // stock against another seller's catalogue entry.
    const [listing] = await this.db.sql<Array<{ id: string }>>`
      select id from catalog.seller_listings
       where sku_id = ${input.skuId} and seller_id = ${sellerId} and archived_at is null
    `;
    if (!listing) {
      throw AppError.validation(
        [{ field: 'skuId', issue: 'Create a listing for this SKU before adding stock' }],
        'No listing exists for this SKU',
      );
    }

    const row = await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [inventory] = await tx<
        Array<{ available_quantity: number; physical_quantity: number }>
      >`
        select available_quantity, physical_quantity
          from inventory.receive_stock(
            ${input.warehouseId}, ${input.skuId}, ${sellerId}, ${input.quantity},
            'PURCHASE_RECEIPT', ${input.reference ?? null}, ${input.reason ?? null}, null
          )
      `;

      if (!inventory) throw new AppError('INTERNAL_ERROR', 'Stock receipt returned no balance');

      // A listing held OUT_OF_STOCK should become sellable again the moment stock lands;
      // leaving it suppressed is invisible lost revenue.
      await tx`
        update catalog.seller_listings
           set status = 'ACTIVE', status_reason = null
         where sku_id = ${input.skuId}
           and seller_id = ${sellerId}
           and status = 'OUT_OF_STOCK'
      `;

      await tx`select pricing.recompute_buy_box(${input.skuId})`;

      await this.outbox.emit(tx, 'INVENTORY_UPDATED', {
        skuId: input.skuId,
        sellerId,
        warehouseId: input.warehouseId,
        listingId: listing.id,
        availableQuantity: inventory.available_quantity,
        reservedQuantity: 0,
        movementType: 'PURCHASE_RECEIPT',
      });

      return inventory;
    });

    return {
      availableQuantity: row.available_quantity,
      physicalQuantity: row.physical_quantity,
    };
  }

  /**
   * Requests an adjustment. Does NOT apply it.
   *
   * An increase still needs a second pair of eyes: "found" stock that nobody purchased is
   * as much of a red flag as stock that disappeared.
   */
  async requestAdjustment(input: AdjustmentInput): Promise<{
    adjustmentId: string;
    status: string;
    requiresApproval: true;
  }> {
    const { sellerId } = await this.assertWarehouseAccess(input.warehouseId);
    const principal = RequestContext.requirePrincipal();

    const [balance] = await this.db.sql<
      Array<{
        id: string;
        available_quantity: number;
        damaged_quantity: number;
        blocked_quantity: number;
      }>
    >`
      select id, available_quantity, damaged_quantity, blocked_quantity
        from inventory.warehouse_inventory
       where warehouse_id = ${input.warehouseId}
         and sku_id = ${input.skuId}
         and seller_id = ${sellerId}
    `;

    if (!balance) throw AppError.notFound('Inventory record');

    const before =
      input.targetBucket === 'DAMAGED'
        ? balance.damaged_quantity
        : input.targetBucket === 'BLOCKED'
          ? balance.blocked_quantity
          : balance.available_quantity;

    // Reject an impossible adjustment now rather than at approval time, when the approver
    // would have to work out why it failed.
    if (before + input.quantityDelta < 0) {
      throw AppError.validation(
        [
          {
            field: 'quantityDelta',
            issue: `Only ${before} units in ${input.targetBucket}; cannot reduce by ${Math.abs(input.quantityDelta)}`,
          },
        ],
        'Adjustment would drive the balance negative',
      );
    }

    const row = await this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [adjustment] = await tx<Array<{ id: string; status: string }>>`
        insert into inventory.inventory_adjustments (
          warehouse_inventory_id, warehouse_id, sku_id, seller_id, adjustment_type,
          quantity_delta, target_bucket, quantity_before, reason, evidence_urls,
          status, requested_by, idempotency_key
        ) values (
          ${balance.id}, ${input.warehouseId}, ${input.skuId}, ${sellerId},
          ${input.adjustmentType}, ${input.quantityDelta}, ${input.targetBucket},
          ${before}, ${input.reason}, ${input.evidenceUrls},
          'PENDING_APPROVAL', ${principal.userId},
          ${`adjust:${balance.id}:${input.adjustmentType}:${input.quantityDelta}:${Date.now()}`}
        )
        returning id, status
      `;
      return adjustment!;
    });

    this.logger.log(
      {
        adjustmentId: row.id,
        skuId: input.skuId,
        delta: input.quantityDelta,
        type: input.adjustmentType,
        requestedBy: principal.userId,
      },
      'Inventory adjustment requested',
    );

    return { adjustmentId: row.id, status: row.status, requiresApproval: true };
  }

  /**
   * Approves and applies an adjustment.
   *
   * Requires inventory.approve_adjustment permission, and the database refuses when the
   * approver is the requester. The two checks are intentionally redundant: the permission
   * can be misconfigured, the constraint cannot.
   */
  async approveAdjustment(
    adjustmentId: string,
    input: { approved: boolean; reason?: string },
  ): Promise<{ status: string; availableQuantity?: number }> {
    const principal = RequestContext.requirePrincipal();

    const [adjustment] = await this.db.sql<
      Array<{
        id: string;
        warehouse_id: string;
        sku_id: string;
        seller_id: string;
        status: string;
        requested_by: string;
        quantity_delta: number;
      }>
    >`
      select id, warehouse_id, sku_id, seller_id, status, requested_by, quantity_delta
        from inventory.inventory_adjustments where id = ${adjustmentId}
    `;

    if (!adjustment) throw AppError.notFound('Adjustment');

    // Deliberately NOT scoped to the warehouse.
    //
    // inventory.approve_adjustment is a platform permission held by operations and
    // warehouse managers, not by sellers — that is the whole point of the maker-checker
    // split. Requiring the approver to also hold the seller's or warehouse's scope would
    // mean only the seller could approve their own write-offs, which is precisely what
    // separation of duties forbids. The permission guard on the route is the authority
    // here, and the database independently refuses self-approval.

    if (adjustment.status !== 'PENDING_APPROVAL') {
      throw new AppError('CONFLICT', `Adjustment is already ${adjustment.status}`);
    }

    if (adjustment.requested_by === principal.userId) {
      throw AppError.forbidden(
        'An adjustment must be approved by someone other than the person who requested it',
      );
    }

    if (!input.approved) {
      if (!input.reason) {
        throw AppError.validation([
          { field: 'reason', issue: 'A rejection reason is required' },
        ]);
      }
      await this.db.sql`
        update inventory.inventory_adjustments
           set status = 'REJECTED', rejection_reason = ${input.reason}
         where id = ${adjustmentId}
      `;
      return { status: 'REJECTED' };
    }

    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      await tx`
        update inventory.inventory_adjustments
           set status = 'APPROVED', approved_by = ${principal.userId}, approved_at = now()
         where id = ${adjustmentId}
      `;

      // apply_adjustment moves the balance, writes the ledger entry and marks the
      // adjustment APPLIED, all under the inventory row's lock.
      const [inventory] = await tx<
        Array<{ available_quantity: number; reserved_quantity: number }>
      >`
        select available_quantity, reserved_quantity
          from inventory.apply_adjustment(${adjustmentId})
      `;

      if (!inventory) throw new AppError('INTERNAL_ERROR', 'Adjustment returned no balance');

      // Stock going to zero must take the listing out of the Buy Box, or the storefront
      // keeps offering something that cannot ship.
      if (inventory.available_quantity <= 0) {
        await tx`
          update catalog.seller_listings
             set status = 'OUT_OF_STOCK'
           where sku_id = ${adjustment.sku_id}
             and seller_id = ${adjustment.seller_id}
             and status = 'ACTIVE'
        `;
      }

      await tx`select pricing.recompute_buy_box(${adjustment.sku_id})`;

      await this.outbox.emit(tx, 'INVENTORY_UPDATED', {
        skuId: adjustment.sku_id,
        sellerId: adjustment.seller_id,
        warehouseId: adjustment.warehouse_id,
        listingId: null,
        availableQuantity: inventory.available_quantity,
        reservedQuantity: inventory.reserved_quantity,
        movementType: adjustment.quantity_delta > 0 ? 'ADJUSTMENT_INCREASE' : 'ADJUSTMENT_DECREASE',
      });

      return { status: 'APPLIED', availableQuantity: inventory.available_quantity };
    });
  }

  /** Current stock across the seller's warehouses. */
  async list(
    sellerId: string,
    query: { limit: number; offset: number; warehouseId?: string; lowStockOnly?: boolean },
  ): Promise<Array<Record<string, unknown>>> {
    await this.assertSellerMembership(sellerId);
    const sql = this.db.sql;

    return sql<Array<Record<string, unknown>>>`
      select wi.id, wi.warehouse_id, w.code as warehouse_code, w.name as warehouse_name,
             wi.sku_id, sk.sku_code, p.title as product_title, pv.variant_label,
             wi.available_quantity, wi.reserved_quantity, wi.damaged_quantity,
             wi.in_transit_quantity, wi.blocked_quantity, wi.physical_quantity,
             wi.reorder_point, wi.bin_location, wi.last_counted_at, wi.last_received_at
        from inventory.warehouse_inventory wi
        join inventory.warehouses w on w.id = wi.warehouse_id
        join catalog.skus sk on sk.id = wi.sku_id
        join catalog.products p on p.id = sk.product_id
        left join catalog.product_variants pv on pv.id = sk.variant_id
       where wi.seller_id = ${sellerId}
         ${query.warehouseId ? sql`and wi.warehouse_id = ${query.warehouseId}` : sql``}
         ${query.lowStockOnly
        ? sql`and wi.reorder_point is not null and wi.available_quantity <= wi.reorder_point`
        : sql``
      }
       order by wi.available_quantity asc, p.title
       limit ${query.limit} offset ${query.offset}
    `;
  }

  /**
   * The movement ledger for one SKU (brief §24).
   *
   * This is the audit trail: every change to a balance, with its cause. Append-only, so it
   * answers "where did those twelve units go?" definitively.
   */
  async ledger(
    sellerId: string,
    query: { skuId: string; warehouseId?: string; limit: number },
  ): Promise<Array<Record<string, unknown>>> {
    await this.assertSellerMembership(sellerId);
    const sql = this.db.sql;

    return sql<Array<Record<string, unknown>>>`
      select il.id, il.movement_type, il.available_delta, il.reserved_delta,
             il.damaged_delta, il.in_transit_delta, il.available_after, il.reserved_after,
             il.reason, il.reference, il.actor_type, il.occurred_at,
             il.order_id, il.order_item_id, il.adjustment_id, il.transfer_id,
             o.order_number
        from inventory.inventory_ledger il
        left join commerce.orders o on o.id = il.order_id
       where il.seller_id = ${sellerId}
         and il.sku_id = ${query.skuId}
         ${query.warehouseId ? sql`and il.warehouse_id = ${query.warehouseId}` : sql``}
       order by il.occurred_at desc
       limit ${query.limit}
    `;
  }

  async transfers(sellerId: string, limit: number): Promise<Array<Record<string, unknown>>> {
    await this.assertSellerMembership(sellerId);
    return this.db.sql<Array<Record<string, unknown>>>`
      select t.id, t.transfer_reference, t.seller_id, t.source_warehouse_id,
             sw.name as source_warehouse_name, t.target_warehouse_id,
             tw.name as target_warehouse_name, t.status, t.reason,
             t.expected_arrival_at, t.dispatched_at, t.received_at, t.created_at,
             coalesce(jsonb_agg(jsonb_build_object('skuId', ti.sku_id, 'requested', ti.quantity_requested, 'dispatched', ti.quantity_dispatched, 'received', ti.quantity_received)) filter (where ti.id is not null), '[]'::jsonb) as items
        from inventory.inventory_transfers t
        join inventory.warehouses sw on sw.id = t.source_warehouse_id
        join inventory.warehouses tw on tw.id = t.target_warehouse_id
        left join inventory.inventory_transfer_items ti on ti.transfer_id = t.id
       where t.seller_id = ${sellerId}
       group by t.id, sw.name, tw.name order by t.created_at desc limit ${limit}
    `;
  }

  async createTransfer(input: TransferInput): Promise<Record<string, unknown>> {
    await this.assertSellerMembership(input.sellerId);
    const principal = RequestContext.requirePrincipal();
    const [warehouses] = await this.db.sql<Array<{ source_seller_id: string | null; target_seller_id: string | null }>>`
      select (select seller_id from inventory.warehouses where id = ${input.sourceWarehouseId} and is_active) as source_seller_id,
             (select seller_id from inventory.warehouses where id = ${input.targetWarehouseId} and is_active) as target_seller_id
    `;
    if (!warehouses || warehouses.source_seller_id !== input.sellerId || warehouses.target_seller_id !== input.sellerId) throw AppError.notFound('Warehouse');
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [transfer] = await tx<Array<{ id: string; transfer_reference: string; status: string }>>`
        insert into inventory.inventory_transfers (seller_id, source_warehouse_id, target_warehouse_id, reason, expected_arrival_at, created_by)
        values (${input.sellerId}, ${input.sourceWarehouseId}, ${input.targetWarehouseId}, ${input.reason}, ${input.expectedArrivalAt ?? null}, ${principal.userId})
        returning id, transfer_reference, status
      `;
      if (!transfer) throw new AppError('INTERNAL_ERROR', 'Transfer was not created');
      for (const item of input.items) await tx`insert into inventory.inventory_transfer_items (transfer_id, sku_id, quantity_requested) values (${transfer.id}, ${item.skuId}, ${item.quantity})`;
      return { ...transfer, itemCount: input.items.length };
    });
  }

  async dispatchTransfer(transferId: string): Promise<Record<string, unknown>> {
    const principal = RequestContext.requirePrincipal();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [transfer] = await tx<Array<{ id: string; seller_id: string; status: string }>>`select id, seller_id, status from inventory.inventory_transfers where id = ${transferId} for update`;
      if (!transfer) throw AppError.notFound('Transfer');
      await this.assertSellerMembership(transfer.seller_id);
      const [row] = await tx<Array<{ dispatch_transfer: number }>>`select inventory.dispatch_transfer(${transferId})`;
      this.logger.log({ transferId, actorId: principal.userId }, 'Inventory transfer dispatched');
      return { id: transferId, status: 'IN_TRANSIT', itemsDispatched: row?.dispatch_transfer ?? 0 };
    });
  }

  async receiveTransfer(transferId: string): Promise<Record<string, unknown>> {
    const [transfer] = await this.db.sql<Array<{ id: string; seller_id: string }>>`select id, seller_id from inventory.inventory_transfers where id = ${transferId}`;
    if (!transfer) throw AppError.notFound('Transfer');
    await this.assertSellerMembership(transfer.seller_id);
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [row] = await tx<Array<{ receive_transfer: number }>>`select inventory.receive_transfer(${transferId})`;
      return { id: transferId, status: 'RECEIVED', itemsReceived: row?.receive_transfer ?? 0 };
    });
  }

  async createStockCount(input: StockCountInput): Promise<Record<string, unknown>> {
    const { sellerId } = await this.assertWarehouseAccess(input.warehouseId);
    const principal = RequestContext.requirePrincipal();
    return this.db.transaction(RequestContext.sessionContext(), async (tx) => {
      const [count] = await tx<Array<{ id: string }>>`insert into inventory.stock_counts (warehouse_id, count_type, bin_filter, counted_by, status, completed_at, notes) values (${input.warehouseId}, ${input.countType}, ${input.binFilter ?? null}, ${principal.userId}, 'PENDING_REVIEW', now(), ${input.notes ?? null}) returning id`;
      if (!count) throw new AppError('INTERNAL_ERROR', 'Stock count was not created');
      let varianceCount = 0;
      for (const line of input.lines) {
        const [inventory] = await tx<Array<{ id: string; available_quantity: number }>>`select id, available_quantity from inventory.warehouse_inventory where warehouse_id = ${input.warehouseId} and sku_id = ${line.skuId} and seller_id = ${sellerId} for update`;
        if (!inventory) throw AppError.notFound('Inventory record');
        await tx`insert into inventory.stock_count_lines (stock_count_id, warehouse_inventory_id, sku_id, expected_quantity, counted_quantity, scanned_barcode, notes) values (${count.id}, ${inventory.id}, ${line.skuId}, ${inventory.available_quantity}, ${line.countedQuantity}, ${line.scannedBarcode ?? null}, ${line.notes ?? null})`;
        const delta = line.countedQuantity - inventory.available_quantity;
        if (delta !== 0) {
          varianceCount += 1;
          const adjustmentReason = line.notes && line.notes.trim().length >= 10 ? line.notes.trim() : 'Cycle count variance';
          await tx`insert into inventory.inventory_adjustments (warehouse_inventory_id, warehouse_id, sku_id, seller_id, adjustment_type, quantity_delta, target_bucket, quantity_before, reason, status, requested_by, idempotency_key) values (${inventory.id}, ${input.warehouseId}, ${line.skuId}, ${sellerId}, 'CYCLE_COUNT', ${delta}, 'AVAILABLE', ${inventory.available_quantity}, ${adjustmentReason}, 'PENDING_APPROVAL', ${principal.userId}, ${`count:${count.id}:${line.skuId}`}) on conflict (idempotency_key) where idempotency_key is not null do nothing`;
        }
      }
      await tx`update inventory.stock_counts set lines_counted = ${input.lines.length}, lines_with_variance = ${varianceCount} where id = ${count.id}`;
      return { id: count.id, status: 'PENDING_REVIEW', linesCounted: input.lines.length, linesWithVariance: varianceCount };
    });
  }

  // -------------------------------------------------------------------------
  // Guards
  // -------------------------------------------------------------------------

  /**
   * Confirms the caller may write to this warehouse, and returns its owning seller.
   *
   * Resolving the seller FROM the warehouse rather than trusting a seller id in the
   * request is what stops a caller adding stock to a warehouse they do not own.
   */
  private async assertWarehouseAccess(warehouseId: string): Promise<{ sellerId: string }> {
    const principal = RequestContext.requirePrincipal();

    const [warehouse] = await this.db.sql<
      Array<{ id: string; seller_id: string | null; warehouse_type: string }>
    >`
      select id, seller_id, warehouse_type from inventory.warehouses
       where id = ${warehouseId} and is_active
    `;

    if (!warehouse) throw AppError.notFound('Warehouse');

    const isStaff =
      principal.roles.includes('ADMIN') ||
      principal.roles.includes('SUPER_ADMIN') ||
      principal.warehouseIds.includes(warehouseId);

    if (isStaff) {
      if (!warehouse.seller_id) {
        // A NovaMart-operated node holds stock for many sellers, so the caller must say
        // which one. Not supported through this endpoint.
        throw AppError.validation([
          { field: 'warehouseId', issue: 'Platform warehouses are managed from the operations console' },
        ]);
      }
      return { sellerId: warehouse.seller_id };
    }

    if (!warehouse.seller_id) throw AppError.notFound('Warehouse');

    const [membership] = await this.db.sql<Array<{ role_code: string }>>`
      select role_code from seller.seller_users
       where seller_id = ${warehouse.seller_id}
         and user_id = ${principal.userId}
         and status = 'ACTIVE'
    `;
    if (!membership) throw AppError.notFound('Warehouse');

    return { sellerId: warehouse.seller_id };
  }

  private async assertSellerMembership(sellerId: string): Promise<void> {
    const principal = RequestContext.requirePrincipal();
    if (principal.roles.includes('ADMIN') || principal.roles.includes('SUPER_ADMIN')) return;

    const [membership] = await this.db.sql<Array<{ role_code: string }>>`
      select role_code from seller.seller_users
       where seller_id = ${sellerId} and user_id = ${principal.userId} and status = 'ACTIVE'
    `;
    if (!membership) throw AppError.notFound('Seller');
  }
}
