'use server';

import { api } from '@/lib/api';
import { redirect } from 'next/navigation';

export async function addToCart(formData: FormData) {
  const listingId = String(formData.get('listingId') ?? '');
  const quantity = Math.max(1, Number(formData.get('quantity') ?? 1));
  if (!listingId) redirect('/cart');
  await (await api()).post('/cart/items', { listingId, quantity });
  redirect('/cart');
}
