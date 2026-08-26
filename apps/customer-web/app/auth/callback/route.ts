import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next')?.startsWith('/') ? url.searchParams.get('next')! : '/account';
  const store = await cookies();
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (!code || !supabaseUrl || !key) return NextResponse.redirect(new URL('/login?error=auth_callback_failed', url));
  const supabase = createServerClient(supabaseUrl, key, { cookies: { getAll: () => store.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => store.set(name, value, options)) } });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? `/login?error=${encodeURIComponent(error.message)}` : next, url));
}
