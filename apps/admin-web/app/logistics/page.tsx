import { adminRead, AdminTable } from '../_components';
export default async function LogisticsPage() { return <AdminTable title="Logistics" description="Shipments, carriers, AWBs, tracking and delivery exceptions." rows={await adminRead('/admin/logistics?limit=100', [])} emptyTitle="No shipments" />; }
