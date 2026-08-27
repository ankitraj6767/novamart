import { adminRead, AdminTable } from '../_components';
export default async function SystemPage() { return <AdminTable title="System" description="Feature flags, app versions, integrations and runtime configuration." rows={await adminRead('/admin/platform/integrations', [])} emptyTitle="No integrations" />; }
