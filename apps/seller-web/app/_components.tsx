import { api } from '@/lib/api';
import { Badge, Card, DataTable, EmptyState, PageShell } from '@novamart/ui';

export function sellerId(): string | null {
  return process.env['NOVAMART_SELLER_ID'] ?? null;
}

export async function sellerRead<T>(path: string, fallback: T): Promise<T> {
  const id = sellerId();
  if (!id) return fallback;
  return (await api()).get<T>(path).catch(() => fallback);
}

export function MissingSeller({ title = 'Seller account not configured' }: { title?: string }) {
  return <EmptyState title={title} description="Set NOVAMART_SELLER_ID and sign in with a seller-scoped account to load this workspace." />;
}

export function SellerTable({
  title,
  description,
  headers,
  rows,
  emptyTitle,
}: {
  title: string;
  description: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  emptyTitle: string;
}) {
  return <PageShell eyebrow="Seller Center" title={title} description={description}><DataTable><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row['id'] ?? index)}>{Object.values(row).map((value, valueIndex) => <td key={valueIndex}>{value === null || value === undefined ? '—' : String(value)}</td>)}</tr>)}</tbody></DataTable>{rows.length === 0 && <EmptyState title={emptyTitle} description="No records are available for the selected seller scope." />}</PageShell>;
}

export function StatusCard({ label, value, detail, tone = 'accent' }: { label: string; value: string; detail: string; tone?: 'accent' | 'success' | 'warning' | 'danger' }) {
  return <Card><Badge tone={tone}>{label}</Badge><h2 style={{ marginTop: 12 }}>{value}</h2><p className="nm-muted">{detail}</p></Card>;
}
