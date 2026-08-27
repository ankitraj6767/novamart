import { adminRead, AdminTable } from '../_components';
export default async function EmployeesPage() { return <AdminTable title="Employees & permissions" description="Role catalogue, permission catalogue and scoped grants." rows={await adminRead('/admin/identity/roles', [])} emptyTitle="No roles" />; }
