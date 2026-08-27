import { adminRead, AdminTable } from '../_components';
export default async function CatalogPage() { return <AdminTable title="Catalog governance" description="Products, brands, categories, listings and moderation state." rows={await adminRead('/admin/catalog?limit=100', [])} emptyTitle="No catalog records" />; }
