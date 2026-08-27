import { adminRead, AdminTable } from '../_components';
export default async function ReturnsPage() { return <AdminTable title="Returns" description="Return approvals, inspections, replacement and refund decisions." rows={await adminRead('/admin/returns?limit=100', [])} emptyTitle="No returns" />; }
