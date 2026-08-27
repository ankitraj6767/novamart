import { adminRead, AdminTable } from '../_components';
export default async function PromotionsPage() { return <AdminTable title="Promotions" description="Campaigns, coupons, bank offers and flash-sale controls." rows={await adminRead('/admin/marketing/campaigns', [])} emptyTitle="No campaigns" />; }
