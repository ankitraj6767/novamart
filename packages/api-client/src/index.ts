import type { ApiResponse } from '@novamart/types';

type AccessTokenResolver = () => Promise<string | null> | string | null;

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: (() => Promise<string | null> | string | null) | string | null;
  fetcher?: typeof fetch;
}

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class NovaMartApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: AccessTokenResolver;
  private readonly fetcher: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    const resolver = options.getAccessToken;
    this.getAccessToken = typeof resolver === 'function' ? resolver : () => resolver ?? null;
    this.fetcher = options.fetcher ?? fetch;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);

    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: init.cache ?? 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as ApiResponse<T>;
    if (!response.ok || payload.success === false) {
      const error = payload.success === false ? payload.error : undefined;
      throw new ApiClientError(
        error?.code ?? `HTTP_${response.status}`,
        error?.message ?? 'Request failed',
        response.status,
        'requestId' in payload ? payload.requestId : undefined,
      );
    }
    return payload.data;
  }

  get<T>(path: string, init: RequestInit = {}) { return this.request<T>(path, { ...init, method: 'GET' }); }

  post<T>(path: string, body?: unknown, init: RequestInit = {}) {
    return this.request<T>(path, { ...init, method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  }

  patch<T>(path: string, body: unknown, init: RequestInit = {}) {
    return this.request<T>(path, { ...init, method: 'PATCH', body: JSON.stringify(body) });
  }

  delete<T>(path: string, init: RequestInit = {}) { return this.request<T>(path, { ...init, method: 'DELETE' }); }
}

export function createServerApiClient(): NovaMartApiClient {
  const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:4000/api/v1';
  const token = process.env['NOVAMART_ACCESS_TOKEN'] ?? null;
  return new NovaMartApiClient({ baseUrl, getAccessToken: token });
}

export function money(paise: number | string | null | undefined): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(paise ?? 0) / 100);
}
