import { sellerId, sellerRead, StatusCard } from '../_components';
import { Card, Metric, MetricGrid, PageShell } from '@novamart/ui';

export default async function SellerPerformance() {
  const id = sellerId();
  const performance = await sellerRead<Record<string, unknown>>(`/sellers/${id}/performance`, {});
  return <PageShell eyebrow="Performance" title="Seller performance" description="A single view of the metrics that influence customer trust, Buy Box position and seller standing."><MetricGrid><Metric label="Score" value={String(performance['score'] ?? performance['seller_score'] ?? '—')} detail="Composite seller score" tone="success" /><Metric label="On-time dispatch" value={`${performance['on_time_dispatch_rate'] ?? '—'}%`} detail="Dispatch SLA" /><Metric label="On-time delivery" value={`${performance['on_time_delivery_rate'] ?? '—'}%`} detail="Carrier outcome" /><Metric label="Returns" value={`${performance['return_rate'] ?? '—'}%`} detail="Item return rate" tone="warning" /></MetricGrid>{!id ? <StatusCard label="Setup" value="Seller ID required" detail="Configure the scoped Seller Center environment." tone="warning" /> : <Card><h2>{String(performance['display_name'] ?? 'Seller')}</h2><p className="nm-muted">{String(performance['tier'] ?? 'NEW')} tier · {String(performance['orders_count'] ?? 0)} orders · {String(performance['units_sold'] ?? 0)} units</p></Card>}</PageShell>;
}
