'use server';

import { randomUUID } from 'node:crypto';
import { api } from '@/lib/api';
import { redirect } from 'next/navigation';

export async function startCheckout() {
  const session = await (await api()).post<{ checkoutSessionId: string }>('/checkout', {});
  redirect(`/checkout/${session.checkoutSessionId}`);
}

export async function placeOrder(formData: FormData) {
  const sessionId = String(formData.get('sessionId') ?? '');
  const totalPaise = Number(formData.get('totalPaise') ?? 0);
  const paymentMethod = String(formData.get('paymentMethod') ?? 'UPI');
  const order = await (await api()).post<{ orderId?: string; id?: string }>(`/checkout/${sessionId}/place-order`, { acknowledgedTotalPaise: totalPaise, paymentMethod }, { headers: { 'Idempotency-Key': randomUUID() } });
  redirect(`/orders/${order.orderId ?? order.id ?? ''}`);
}
