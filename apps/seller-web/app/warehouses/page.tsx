import { sellerId, sellerRead, SellerTable } from '../_components';

export default async function SellerWarehouses() {
  const id = sellerId();
  const rows = await sellerRead<Array<Record<string, unknown>>>(`/sellers/${id}/warehouses`, []);
  return <SellerTable title="Pickup locations" description="Warehouses and pickup locations used for inventory, delivery promises and carrier selection." headers={['Code', 'Name', 'Type', 'City', 'Pincode', 'Status']} rows={rows.map((row) => ({ id: row['id'], code: row['code'], name: row['name'], type: row['warehouse_type'], city: row['city'], pincode: row['pincode'], status: row['is_active'] ? 'ACTIVE' : 'INACTIVE' }))} emptyTitle="No pickup locations" />;
}
