import { api } from '@/lib/api';
import { Card, PageShell } from '@novamart/ui';
export default async function SupportPage() { const articles = await (await api()).get<Array<{ id: string; title: string; summary?: string }>>('/support/help').catch(() => []); return <PageShell eyebrow="Help centre" title="How can we help?" description="Start with a self-serve answer or open a ticket with order context."><div className="nm-grid nm-grid-2">{articles.map((article) => <Card key={article.id}><h2>{article.title}</h2><p className="nm-muted">{article.summary}</p></Card>)}</div></PageShell>; }
