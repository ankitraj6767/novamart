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

/**
 * Production adapter placeholder with a strict failure mode. It prevents a deployment
 * from silently behaving like a fake carrier when credentials or an endpoint are absent.
 * The provider-specific HTTP contracts belong here and can be enabled independently.
 */
class ConfiguredHttpShippingProvider implements ShippingProvider {
  readonly channels = [] as const;
  constructor(
    readonly code: string,
    private readonly env: ServerEnv,
  ) {}

  private unavailable(): never {
    this.env; // keep the configuration dependency explicit for future provider adapters
    throw new Error(`${this.code} shipping adapter is not configured for this environment`);
  }
  async checkServiceability(): Promise<ServiceabilityOption[]> {
    return this.unavailable();
  }
  async createShipment(_input: CreateShipmentInput): Promise<CreateShipmentResult> {
    return this.unavailable();
  }
  async cancelShipment(): Promise<boolean> {
    return this.unavailable();
  }
  async generateLabel(): Promise<{ url: string; format: 'PDF' | 'PNG' | 'ZPL' }> {
    return this.unavailable();
  }
  async trackShipment(): Promise<TrackingUpdate[]> {
    return this.unavailable();
  }
  async schedulePickup(): Promise<boolean> {
    return this.unavailable();
  }
  async createReverseShipment(_input: CreateShipmentInput): Promise<CreateShipmentResult> {
    return this.unavailable();
  }
  verifyWebhook(): {
    valid: boolean;
    awbNumber: string | null;
    updates: TrackingUpdate[];
    reason?: string;
  } {
    return this.unavailable();
  }
}
