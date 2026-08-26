import { cookies } from 'next/headers';
import { NovaMartApiClient } from '@novamart/api-client';
import { createServerClient } from '@supabase/ssr';

export async function api() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const publishableKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  let accessToken = cookieStore.get('nm_access_token')?.value ?? null;
  if (supabaseUrl && publishableKey) {
    const supabase = createServerClient(supabaseUrl, publishableKey, { cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined } });
    accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? accessToken;
  }
  return new NovaMartApiClient({
    baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:4000/api/v1',
    getAccessToken: accessToken,
  });
}
