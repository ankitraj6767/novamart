import { adminRead, AdminTable } from '../_components';
export default async function FinancePage() { const result = await adminRead<Record<string, unknown>>('/admin/finance', {}); return <AdminTable title="Finance" description="Seller ledger, credits, debits and net platform position." rows={[result]} emptyTitle="No finance metrics" />; }
