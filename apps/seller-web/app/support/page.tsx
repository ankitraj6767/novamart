import { sellerRead, SellerTable } from '../_components';

export default async function SellerSupport() {
  const rows = await sellerRead<Array<Record<string, unknown>>>('/support/tickets', []);
  return <SellerTable title="Seller support" description="Support cases keep order, payment, fulfilment and seller context together with SLA deadlines." headers={['Reference', 'Subject', 'Priority', 'Status', 'Updated']} rows={rows.map((row) => ({ id: row['id'], reference: row['ticket_reference'], subject: row['subject'], priority: row['priority'], status: row['status'], updated: row['updated_at'] }))} emptyTitle="No support tickets" />;
}
