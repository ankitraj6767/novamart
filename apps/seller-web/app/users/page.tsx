import { sellerId, sellerRead, SellerTable } from '../_components';

export default async function SellerUsers() {
  const id = sellerId();
  const rows = await sellerRead<Array<Record<string, unknown>>>(`/sellers/${id}/users`, []);
  return <SellerTable title="Users & roles" description="Seller-scoped access with explicit roles and invitation lifecycle." headers={['Name', 'Email', 'Role', 'Status', 'Accepted']} rows={rows.map((row) => ({ id: row['id'], name: row['full_name'] ?? row['invited_email'], email: row['email'] ?? row['invited_email'], role: row['role_code'], status: row['status'], accepted: row['accepted_at'] }))} emptyTitle="No seller users" />;
}
