import { adminRead, AdminTable } from '../_components';
export default async function PaymentsPage() { return <AdminTable title="Payments" description="Intents, provider attempts and server-verified payment outcomes." rows={await adminRead('/admin/payments?limit=100', [])} emptyTitle="No payment attempts" />; }
