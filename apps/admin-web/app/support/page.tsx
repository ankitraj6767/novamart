import { adminRead, AdminTable } from '../_components';
export default async function SupportPage() { return <AdminTable title="Support escalations" description="Priority support queues, SLA deadlines and assignments." rows={await adminRead('/admin/support/queue?limit=100', [])} emptyTitle="No support escalations" />; }
