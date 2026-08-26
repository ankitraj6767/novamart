import { Injectable, Logger } from '@nestjs/common';
import { loadServerEnv, type ServerEnv } from '@novamart/config';
import type {
  CreateShipmentInput,
  CreateShipmentResult,
  ServiceabilityOption,
  ServiceabilityQuery,
  ShippingProvider,
  TrackingUpdate,
} from '@novamart/domain';
import type { Paise } from '@novamart/domain';
import { createHmac, timingSafeEqual } from 'node:crypto';

type ShiprocketServiceability = { data?: { available_courier_companies?: Array<Record<string, unknown>> } };
type ShiprocketCreate = { order_id?: string; shipment_id?: string };
type ShiprocketAwb = { response?: { data?: { awb_code?: string } } };
type ShiprocketLabel = { label_url?: string };
type DelhiveryCreate = { packages?: Array<{ waybill?: string }> };
type TrackingPayload = { tracking_data?: { shipment_track?: Array<Record<string, unknown>> }; ShipmentData?: Array<Record<string, unknown>> };

/**
 * Shipping provider boundary. The database owns shipment state; this adapter owns only
 * carrier calls. Local development uses a deterministic provider, while production must
 * select Shiprocket or Delhivery through environment configuration.
 */
@Injectable()
export class ShippingProviderRegistry {
  private readonly logger = new Logger(ShippingProviderRegistry.name);
  private readonly env: ServerEnv;
  private readonly providers = new Map<string, ShippingProvider>();
  private activeCode: string;

  constructor() {
    this.env = loadServerEnv();
    this.activeCode = this.env.SHIPPING_PROVIDER;
    this.providers.set('mock', new MockShippingProvider());
    this.providers.set('shiprocket', new ConfiguredHttpShippingProvider('shiprocket', this.env));
    this.providers.set('delhivery', new ConfiguredHttpShippingProvider('delhivery', this.env));
  }

  active(): ShippingProvider {
    const provider = this.providers.get(this.activeCode);
    if (!provider) throw new Error(`Shipping provider ${this.activeCode} is not registered`);
    return provider;
  }

  byCode(code: string): ShippingProvider {
    const provider = this.providers.get(code);
    if (!provider) throw new Error(`Shipping provider ${code} is not registered`);
    return provider;
  }

  verifyWebhook(code: string, rawBody: Buffer, headers: Record<string, string | undefined>) {
    return this.byCode(code).verifyWebhook(rawBody, headers);
  }

  activeCodeName(): string {
    return this.activeCode;
  }
}

/** A real local adapter: it creates stable identifiers and exercises the same lifecycle. */
class MockShippingProvider implements ShippingProvider {
  readonly code = 'mock';
  readonly shipments = new Map<string, CreateShipmentResult>();

  async checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityOption[]> {
    return [
      {
        carrierCode: 'MOCK',
        carrierName: 'NovaMart Local Carrier',
        serviceMode: 'SURFACE',
        estimatedDays: query.isCod ? 4 : 3,
        freightPaise: Math.max(5000, Math.ceil(query.weightGrams / 500) * 1000) as Paise,
        codAvailable: true,
        codFeePaise: query.isCod ? 2500 : 0,
        reverseAvailable: true,
      },
    ];
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const result: CreateShipmentResult = {
      providerShipmentId: `mock_ship_${input.shipmentReference}`,
      awbNumber: `MOCK${input.shipmentReference.replace(/[^A-Z0-9]/gi, '').slice(-12)}`,
      carrierCode: input.carrierCode,
      labelUrl: null,
      estimatedDeliveryDate: new Date(Date.now() + 3 * 86_400_000),
      freightPaise: null,
    };
    this.shipments.set(result.providerShipmentId, result);
    return result;
  }

  async cancelShipment(): Promise<boolean> {
    return true;
  }

  async generateLabel(providerShipmentId: string) {
    return {
      url: `/local/shipping-labels/${encodeURIComponent(providerShipmentId)}.pdf`,
      format: 'PDF' as const,
    };
  }

  async trackShipment(awbNumber: string): Promise<TrackingUpdate[]> {
    return [
      {
        providerEventId: `mock-track-${awbNumber}`,
        carrierStatusCode: 'IN_TRANSIT',
        normalisedStatus: 'IN_TRANSIT',
        description: 'Shipment is in transit',
        location: 'NovaMart Hub',
        locationPincode: null,
        occurredAt: new Date(),
        raw: { mock: true, awbNumber },
      },
    ];
  }

  async schedulePickup(): Promise<boolean> {
    return true;
  }
  async createReverseShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    return this.createShipment({ ...input, shipmentReference: `${input.shipmentReference}-REV` });
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>) {
    const configured = process.env['SHIPPING_WEBHOOK_SECRET'] ?? 'mock-shipping-secret';
    const supplied = headers['x-shipping-signature'] ?? headers['x-mock-signature'] ?? '';
    const expected = createHmac('sha256', configured).update(rawBody).digest('hex');
    const valid =
      supplied.length === expected.length &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      /* invalid body */
    }
    return {
      valid,
      awbNumber: typeof payload['awbNumber'] === 'string' ? payload['awbNumber'] : null,
      updates: [],
      reason: valid ? undefined : 'Invalid shipping webhook signature',
    };
  }
}

/** Provider-specific HTTP integration. Credentials remain environment-only. */
class ConfiguredHttpShippingProvider implements ShippingProvider {
  constructor(
    readonly code: string,
    private readonly env: ServerEnv,
  ) {}

  private assertConfigured(): void {
    const configured = this.code === 'shiprocket'
      ? Boolean(this.env.SHIPROCKET_EMAIL && this.env.SHIPROCKET_PASSWORD)
      : Boolean(this.env.DELHIVERY_API_TOKEN);
    if (!configured) throw new Error(`${this.code} shipping credentials are not configured`);
  }

  async checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityOption[]> {
    this.assertConfigured();
    if (this.code === 'shiprocket') {
      const body = (await this.shiprocket('/courier/serviceability/', { method: 'GET', query: { pickup_postcode: query.originPincode, delivery_postcode: query.destinationPincode, weight: String(query.weightGrams / 1000), cod: query.isCod ? '1' : '0' } })) as ShiprocketServiceability;
      return (body.data?.available_courier_companies ?? []).map((carrier) => ({ carrierCode: String(carrier['courier_company_id'] ?? carrier['courier_name'] ?? 'SHIPROCKET'), carrierName: String(carrier['courier_name'] ?? 'Shiprocket carrier'), serviceMode: 'SURFACE' as const, estimatedDays: Number(carrier['estimated_delivery_days'] ?? 5), freightPaise: Math.round(Number(carrier['rate'] ?? 0) * 100), codAvailable: Boolean(carrier['cod']), codFeePaise: Math.round(Number(carrier['cod_charges'] ?? 0) * 100), reverseAvailable: true }));
    }
    const body = (await this.delhivery(`/c/api/pin-codes/json/?filter_codes=${query.destinationPincode}`, { method: 'GET' })) as { delivery_codes?: Array<Record<string, unknown>> };
    return (body.delivery_codes ?? []).map(() => ({ carrierCode: 'DELHIVERY', carrierName: 'Delhivery', serviceMode: 'SURFACE' as const, estimatedDays: 7, freightPaise: 0, codAvailable: query.isCod, codFeePaise: 0, reverseAvailable: true }));
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    this.assertConfigured();
    if (this.code === 'shiprocket') {
      const body = (await this.shiprocket('/orders/create/adhoc', { method: 'POST', body: { order_id: input.shipmentReference, order_date: new Date().toISOString(), pickup_location: 'Primary', billing_customer_name: input.delivery.name, billing_address: input.delivery.addressLine1, billing_address_2: input.delivery.addressLine2 ?? '', billing_city: input.delivery.city, billing_pincode: input.delivery.pincode, billing_state: input.delivery.stateCode, billing_country: 'India', billing_email: input.delivery.email ?? 'support@novamart.in', billing_phone: input.delivery.phone, shipping_is_billing: true, order_items: input.items.map((item) => ({ name: item.name, sku: item.sku, units: item.quantity, selling_price: item.unitPricePaise / 100, hsn: item.hsn ?? '' })), payment_method: input.isCod ? 'COD' : 'Prepaid', sub_total: input.declaredValuePaise / 100, length: (input.dimensions?.lengthMm ?? 100) / 10, breadth: (input.dimensions?.widthMm ?? 100) / 10, height: (input.dimensions?.heightMm ?? 100) / 10, weight: input.weightGrams / 1000 } })) as ShiprocketCreate;
      const providerShipmentId = String(body.shipment_id ?? body.order_id ?? input.shipmentReference);
      const awb = (await this.shiprocket('/courier/assign/awb', { method: 'POST', body: { shipment_id: body.shipment_id, courier_id: Number(input.carrierCode) || undefined } })) as ShiprocketAwb;
      const awbNumber = String(awb.response?.data?.awb_code ?? providerShipmentId);
      return { providerShipmentId, awbNumber, carrierCode: this.code, labelUrl: null, estimatedDeliveryDate: new Date(Date.now() + 5 * 86_400_000), freightPaise: null };
    }
    const body = (await this.delhivery('/api/cmu/create.json', { method: 'POST', body: { shipments: [{ name: input.delivery.name, add: input.delivery.addressLine1, city: input.delivery.city, state: input.delivery.stateCode, pin: input.delivery.pincode, phone: input.delivery.phone, order: input.orderNumber, payment_mode: input.isCod ? 'COD' : 'Pre-paid', products_desc: input.items.map((item) => item.name).join(', '), total_amount: input.declaredValuePaise / 100, weight: input.weightGrams / 1000 }], pickup_location: { name: 'NovaMart' } } })) as DelhiveryCreate;
    const awbNumber = String(body.packages?.[0]?.waybill ?? input.shipmentReference);
    return { providerShipmentId: awbNumber, awbNumber, carrierCode: this.code, labelUrl: null, estimatedDeliveryDate: new Date(Date.now() + 7 * 86_400_000), freightPaise: null };
  }

  async cancelShipment(providerShipmentId: string): Promise<boolean> { this.assertConfigured(); if (this.code === 'shiprocket') await this.shiprocket('/orders/cancel', { method: 'POST', body: { ids: [providerShipmentId] } }); else await this.delhivery('/api/p/edit/json/', { method: 'POST', body: { waybill: providerShipmentId, cancellation: 'true' } }); return true; }

  async generateLabel(providerShipmentId: string): Promise<{ url: string; format: 'PDF' | 'PNG' | 'ZPL' }> { this.assertConfigured(); if (this.code === 'shiprocket') { const body = (await this.shiprocket('/courier/generate/label', { method: 'POST', body: { shipment_id: [providerShipmentId] } })) as ShiprocketLabel; return { url: String(body.label_url ?? ''), format: 'PDF' }; } return { url: `https://track.delhivery.com/api/p/packing_slip?wbns=${encodeURIComponent(providerShipmentId)}`, format: 'PDF' }; }

  async trackShipment(awbNumber: string): Promise<TrackingUpdate[]> { this.assertConfigured(); const payload = this.code === 'shiprocket' ? await this.shiprocket(`/courier/track/awb/${encodeURIComponent(awbNumber)}`, { method: 'GET' }) : await this.delhivery(`/api/v1/packages/json/?waybill=${encodeURIComponent(awbNumber)}`, { method: 'GET' }); return this.normalizeTracking(payload, awbNumber); }
  async schedulePickup(providerShipmentId: string, date: Date): Promise<boolean> { this.assertConfigured(); if (this.code === 'shiprocket') await this.shiprocket('/courier/generate/pickup', { method: 'POST', body: { shipment_id: [providerShipmentId], pickup_date: date.toISOString().slice(0, 10) } }); return true; }
  async createReverseShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> { return this.createShipment({ ...input, shipmentReference: `${input.shipmentReference}-REV` }); }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>) { const secret = this.env.SHIPPING_WEBHOOK_SECRET; if (!secret) return { valid: false, awbNumber: null, updates: [], reason: 'Shipping webhook secret is not configured' }; const supplied = headers['x-shipping-signature'] ?? headers['x-shiprocket-signature'] ?? ''; const expected = createHmac('sha256', secret).update(rawBody).digest('hex'); const valid = supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)); return { valid, awbNumber: null, updates: [], reason: valid ? undefined : 'Invalid shipping webhook signature' }; }

  private async shiprocket(path: string, options: { method: string; body?: unknown; query?: Record<string, string> }): Promise<unknown> { const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: this.env.SHIPROCKET_EMAIL, password: this.env.SHIPROCKET_PASSWORD }) }); if (!response.ok) throw new Error(`Shiprocket auth failed with ${response.status}`); const auth = (await response.json()) as { token?: string }; return this.request(`https://apiv2.shiprocket.in/v1/external${path}`, auth.token ?? '', options); }
  private async delhivery(path: string, options: { method: string; body?: unknown; query?: Record<string, string> }): Promise<unknown> { return this.request(`https://track.delhivery.com${path}`, this.env.DELHIVERY_API_TOKEN ?? '', options); }
  private async request(url: string, token: string, options: { method: string; body?: unknown; query?: Record<string, string> }): Promise<unknown> { const query = options.query ? `?${new URLSearchParams(options.query)}` : ''; const response = await fetch(`${url}${query}`, { method: options.method, headers: { authorization: `Bearer ${token}`, token, 'content-type': 'application/json' }, body: options.body === undefined ? undefined : JSON.stringify(options.body) }); if (!response.ok) throw new Error(`${this.code} shipping request failed with ${response.status}`); return response.json(); }
  private normalizeTracking(payload: unknown, awbNumber: string): TrackingUpdate[] { const root = payload as TrackingPayload; const events = root.tracking_data?.shipment_track ?? root.ShipmentData ?? []; return events.map((event, index) => ({ providerEventId: `${awbNumber}:${index}:${String(event['date'] ?? event['StatusDate'] ?? '')}`, carrierStatusCode: String(event['status'] ?? event['Status'] ?? ''), normalisedStatus: this.normalizeStatus(String(event['status'] ?? event['Status'] ?? 'IN_TRANSIT')), description: String(event['activity'] ?? event['Status'] ?? 'Carrier update'), location: String(event['location'] ?? ''), locationPincode: null, occurredAt: new Date(String(event['date'] ?? event['StatusDate'] ?? Date.now())), raw: event })); }
  private normalizeStatus(value: string): TrackingUpdate['normalisedStatus'] { const status = value.toLowerCase(); if (status.includes('delivered')) return 'DELIVERED'; if (status.includes('out for')) return 'OUT_FOR_DELIVERY'; if (status.includes('picked')) return 'PICKED_UP'; if (status.includes('rto')) return 'RTO_INITIATED'; if (status.includes('fail') || status.includes('ndr')) return 'DELIVERY_FAILED'; return 'IN_TRANSIT'; }
}
