import { cookies } from 'next/headers';
import { NovaMartApiClient } from '@novamart/api-client';
export async function api() { const store = await cookies(); return new NovaMartApiClient({ baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:4000/api/v1', getAccessToken: store.get('nm_access_token')?.value ?? null }); }
