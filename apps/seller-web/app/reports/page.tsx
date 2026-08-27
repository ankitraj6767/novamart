import { sellerId, sellerRead, SellerTable } from '../_components';

export default async function SellerReports() {
  const id = sellerId();
  const rows = await sellerRead<Array<Record<string, unknown>>>(`/sellers/${id}/reports/sales?days=90`, []);
  return <SellerTable title="Sales reports" description="Daily order, unit, GMV and fee totals from immutable order price snapshots." headers={['Date', 'Orders', 'Units', 'GMV (paise)', 'Fees (paise)']} rows={rows.map((row) => ({ id: row['report_date'], date: row['report_date'], orders: row['orders'], units: row['units'], gmv: row['gmv_paise'], fees: row['fees_paise'] }))} emptyTitle="No sales in this period" />;
}
