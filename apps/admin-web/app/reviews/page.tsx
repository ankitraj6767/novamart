import { adminRead, AdminTable } from '../_components';
export default async function ReviewsPage() { return <AdminTable title="Review moderation" description="Reported, flagged and pending customer reviews." rows={await adminRead('/admin/reviews/queue?limit=100', [])} emptyTitle="No review cases" />; }
