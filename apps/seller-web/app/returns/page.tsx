import { sellerId, sellerRead, SellerTable } from '../_components';

export default async function SellerReturns() {
  const id = sellerId();
  const rows = await sellerRead<Array<Record<string, unknown>>>(`/sellers/${id}/returns`, []);
  return <SellerTable title="Returns & refunds" description="Review return requests, requested resolutions and the status of every seller item." headers={['Reference', 'Order', 'Reason', 'Resolution', 'Status']} rows={rows.map((row) => ({ id: row['id'], reference: row['return_reference'], order: row['order_number'], reason: row['reason_code'], resolution: row['resolution_requested'], status: row['status'] }))} emptyTitle="No return requests" />;
}
