import { EVENT_TYPES, type EventType } from '@novamart/events';
import type { Consumer, OutboxEvent } from '../outbox/consumer';
import type { Tx, WorkerContext } from '../runtime/context';

/**
 * Posts seller earnings to the immutable ledger when an item is delivered.
 *
 * Revenue is recognised on DELIVERY, not on payment. Money taken for an order that is
 * still in transit is not yet the seller's: it may be refused at the door, returned, or
 * lost. Posting at delivery is what makes the settlement hold period meaningful (§40).
 *
 * The work itself is finance.post_order_item_earnings, which writes the SALE credit and
 * the COMMISSION / fee debits as balanced ledger entries. It is idempotent on
 * order_item_id, so a redelivered event cannot pay a seller twice — and the consumer
 * offset makes that doubly true.
 */
export class FinanceConsumer implements Consumer {
  readonly name = 'finance-earnings-poster';

  readonly eventTypes: readonly EventType[] = [
    EVENT_TYPES.ORDER_DELIVERED,
    EVENT_TYPES.RETURN_RECEIVED,
  ];

  async handle(event: OutboxEvent, tx: Tx, ctx: WorkerContext): Promise<void> {
    const orderItemIds = Array.isArray(event.payload['orderItemIds'])
      ? (event.payload['orderItemIds'] as string[]).filter((id) => this.isUuid(id))
      : [];

    if (orderItemIds.length === 0) {
      ctx.logger.debug(
        { eventId: event.id, eventType: event.event_type },
        'No order items on event; nothing to post',
      );
      return;
    }

    if (event.event_type === EVENT_TYPES.ORDER_DELIVERED) {
      await this.postEarnings(orderItemIds, tx, ctx);
      return;
    }

    await this.reverseEarnings(event, orderItemIds, tx, ctx);
  }

  private async postEarnings(
    orderItemIds: string[],
    tx: Tx,
    ctx: WorkerContext,
  ): Promise<void> {
    for (const orderItemId of orderItemIds) {
      // Only post for items that actually reached the customer. A shipment event can
      // carry items that were cancelled or short-shipped, and paying for those would
      // create a debt the settlement cannot explain.
      const [item] = await tx<Array<{ status: string; seller_id: string }>>`
        select status, seller_id from commerce.order_items where id = ${orderItemId}
      `;

      if (!item || item.status !== 'DELIVERED') {
        ctx.logger.debug(
          { orderItemId, status: item?.status ?? 'MISSING' },
          'Item is not delivered; skipping earnings',
        );
        continue;
      }

      // The seller's configured hold period governs when the credit becomes settleable;
      // passing null lets the function resolve it from the seller record.
      const [result] = await tx<Array<{ post_order_item_earnings: number }>>`
        select finance.post_order_item_earnings(${orderItemId}, null)
      `;

      ctx.logger.info(
        { orderItemId, sellerId: item.seller_id, entries: result?.post_order_item_earnings ?? 0 },
        'Posted seller earnings',
      );
    }
  }

  /**
   * Reverses earnings for returned items.
   *
   * A reversal is a NEW pair of ledger entries, never an edit or delete of the original.
   * The ledger is append-only precisely so a settlement that has already been paid out
   * can still be reconciled afterwards (§40).
   */
  private async reverseEarnings(
    event: OutboxEvent,
    orderItemIds: string[],
    tx: Tx,
    ctx: WorkerContext,
  ): Promise<void> {
    const returnRequestId = this.uuid(event.payload['returnRequestId']);

    for (const orderItemId of orderItemIds) {
      const entries = await tx<
        Array<{
          seller_id: string;
          entry_type: string;
          direction: string;
          amount_paise: string;
          tax_paise: string;
          order_id: string | null;
          description: string;
        }>
      >`
        select seller_id, entry_type, direction,
               amount_paise::text as amount_paise,
               tax_paise::text as tax_paise,
               order_id, description
          from finance.seller_ledger
         where order_item_id = ${orderItemId}
           and entry_type in ('SALE', 'COMMISSION', 'PLATFORM_FEE', 'SHIPPING_FEE')
      `;

      if (entries.length === 0) {
        // Earnings were never posted — the item was returned before delivery, or the
        // delivery event has not been consumed yet. Nothing to reverse.
        ctx.logger.debug({ orderItemId }, 'No posted earnings to reverse');
        continue;
      }

      for (const entry of entries) {
        // seller_ledger_sign_matches_direction requires CREDIT amounts to be positive
        // and DEBIT amounts negative, so reversing means negating the amount as well as
        // flipping the direction. Flipping only the direction would violate the
        // constraint, and if it somehow did not, it would double the balance instead of
        // cancelling it.
        const reversedDirection = entry.direction === 'CREDIT' ? 'DEBIT' : 'CREDIT';
        const reversedAmount = -Number(entry.amount_paise);
        const reversedTax = -Number(entry.tax_paise);

        await tx`
          insert into finance.seller_ledger (
            seller_id, entry_type, direction, amount_paise, tax_paise,
            order_id, order_item_id, return_request_id, description,
            posting_date, available_for_settlement_on, idempotency_key, source_event_id
          ) values (
            ${entry.seller_id},
            ${this.reversalEntryType(entry.entry_type)},
            ${reversedDirection},
            ${reversedAmount}, ${reversedTax},
            ${entry.order_id}, ${orderItemId}, ${returnRequestId},
            ${`Reversal of ${entry.entry_type}: ${entry.description}`.slice(0, 500)},
            current_date, current_date,
            ${`return-reversal:${orderItemId}:${entry.entry_type}`},
            ${event.id}
          )
          on conflict (idempotency_key) where (idempotency_key is not null) do nothing
        `;
      }

      ctx.logger.info(
        { orderItemId, reversed: entries.length },
        'Reversed seller earnings for return',
      );
    }
  }

  /**
   * Maps an original entry type to the type its reversal is recorded under.
   *
   * seller_ledger_entry_type_check has a fixed vocabulary, and the reversal types are
   * distinct on purpose: a finance report needs to tell a sale from the reversal of a
   * sale, not just observe that the balances net to zero.
   */
  private reversalEntryType(original: string): string {
    switch (original) {
      case 'SALE':
        return 'SALE_REVERSAL';
      case 'COMMISSION':
        return 'COMMISSION_REVERSAL';
      default:
        return 'RETURN_DEDUCTION';
    }
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f-]{36}$/i.test(value);
  }

  private uuid(value: unknown): string | null {
    return typeof value === 'string' && this.isUuid(value) ? value : null;
  }
}
