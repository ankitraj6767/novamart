import { adminRead, AdminTable } from '../_components';
export default async function OrdersPage() { return <AdminTable title="Orders" description="Customer orders, item status and fulfilment summary." rows={await adminRead('/admin/orders?limit=100', [])} emptyTitle="No orders" />; }
