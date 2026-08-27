import { adminRead, AdminTable } from '../_components';
export default async function CustomersPage() { return <AdminTable title="Customers" description="Profiles, order history, activity and risk context." rows={await adminRead('/admin/customers?limit=100', [])} emptyTitle="No customers" />; }
