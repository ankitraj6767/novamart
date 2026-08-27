import { adminRead, AdminTable } from '../_components';
export default async function InventoryPage() { return <AdminTable title="Inventory control" description="Warehouse stock, reservations, transfers, adjustments and ledger-backed reconciliation." rows={await adminRead('/admin/inventory?limit=100', [])} emptyTitle="No inventory records" />; }
