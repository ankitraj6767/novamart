'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

async function client() {
  const store = await cookies();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) return { client: null, store };
  return { client: createServerClient(url, key, { cookies: { getAll: () => store.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => store.set(name, value, options)) } }), store };
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const { client: supabase } = await client();
  if (supabase) {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) redirect(`/login?error=${encodeURIComponent(result.error.message)}`);
  } else {
    const token = String(formData.get('token') ?? '').trim();
    const store = await cookies();
    store.set('nm_access_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
  }
  redirect('/account');
}

export async function sendOtp(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const { client: supabase } = await client();
  if (supabase) await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  redirect('/login?otp=sent');
}

export async function logout() {
  const { client: supabase } = await client();
  if (supabase) await supabase.auth.signOut();
  (await cookies()).delete('nm_access_token');
  redirect('/');
}
