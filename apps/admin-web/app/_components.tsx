import { api } from '@/lib/api';
import { DataTable, EmptyState, PageShell } from '@novamart/ui';

export async function adminRead<T>(path: string, fallback: T): Promise<T> {
  return (await api()).get<T>(path).catch(() => fallback);
}

export function AdminTable({
  title,
  description,
  rows,
  emptyTitle = 'Nothing in this queue',
}: {
  title: string;
  description: string;
  rows: Array<Record<string, unknown>>;
  emptyTitle?: string;
}) {
  const keys = rows.length ? Object.keys(rows[0]!).slice(0, 8) : ['status'];
  return <PageShell eyebrow="Admin control centre" title={title} description={description}><DataTable><thead><tr>{keys.map((key) => <th key={key}>{key.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row['id'] ?? index)}>{keys.map((key) => <td key={key}>{formatValue(row[key])}</td>)}</tr>)}</tbody></DataTable>{rows.length === 0 && <EmptyState title={emptyTitle} description="No records are available for the current filters." />}</PageShell>;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
