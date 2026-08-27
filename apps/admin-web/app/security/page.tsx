import { adminRead, AdminTable } from '../_components';
export default async function SecurityPage() { return <AdminTable title="Security audit" description="Sensitive admin actions and database-audited changes." rows={await adminRead('/admin/audit?limit=100', [])} emptyTitle="No audit entries" />; }
