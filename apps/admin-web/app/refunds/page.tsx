import { adminRead, AdminTable } from '../_components';
export default async function RefundsPage() { return <AdminTable title="Refunds" description="Pending, approved, processing and reconciled refunds." rows={await adminRead('/admin/refunds?limit=100', [])} emptyTitle="No refunds" />; }
