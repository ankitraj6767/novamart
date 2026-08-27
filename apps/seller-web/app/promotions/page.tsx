import { sellerId, sellerRead, SellerTable } from '../_components';

export default async function SellerPromotions() {
  const id = sellerId();
  const rows = await sellerRead<Array<Record<string, unknown>>>(`/sellers/${id}/promotions`, []);
  return <SellerTable title="Promotions" description="Seller-funded and seller-targeted offers resolved from the pricing rule engine." headers={['Code', 'Name', 'Type', 'Funding', 'Starts', 'Ends', 'Status']} rows={rows.map((row) => ({ id: row['id'], code: row['code'], name: row['name'], type: row['promotion_type'], funding: row['funded_by'], starts: row['starts_at'], ends: row['ends_at'], status: row['status'] }))} emptyTitle="No active promotions" />;
}
