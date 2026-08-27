import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { money } from '@novamart/api-client';
import { Card, EmptyState, PageShell } from '@novamart/ui';

type Props = { params: Promise<{ path: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  const categoryPath = path.join('/');
  const category = await (await api())
    .get<{ name: string; description?: string | null }>(
      `/catalog/categories/${encodeURIComponent(categoryPath)}`,
    )
    .catch(() => null);
  return {
    title: category?.name ?? 'Category',
    description: category?.description ?? `Shop ${category?.name ?? 'verified products'} on NovaMart.`,
    alternates: { canonical: `/category/${categoryPath}` },
    openGraph: {
      type: 'website',
      title: category?.name ?? 'NovaMart category',
      description: category?.description ?? 'Explore verified offers from NovaMart sellers.',
      url: `/category/${categoryPath}`,
    },
  };
}
export default async function CategoryPage({ params }: Props) {
  const { path } = await params;
  const categoryPath = path.join('/');
  const client = await api();
  const [category, products] = await Promise.all([
    client.get<{ name: string; path: string; description?: string | null }>(`/catalog/categories/${encodeURIComponent(categoryPath)}`).catch(() => null),
    client.get<Array<{ productId: string; slug: string; title: string; imageUrl?: string | null; price?: { display: string } | null }>>(`/catalog/products?category=${encodeURIComponent(categoryPath)}&limit=48&sort=popularity`).catch(() => []),
  ]);
  return <PageShell eyebrow="Category" title={category?.name ?? path.at(-1) ?? 'Category'} description={category?.description ?? 'Explore verified offers from NovaMart sellers.'}><div className="nm-product-grid">{products.map((item) => <Link href={`/product/${item.slug}`} key={item.productId}><Card className="nm-product-card"><div className="nm-product-image">{item.imageUrl && <Image src={item.imageUrl} alt="" width={480} height={480} unoptimized />}</div><div className="nm-product-copy"><h3>{item.title}</h3><span className="nm-price">{item.price?.display ?? money(0)}</span></div></Card></Link>)}</div>{!products.length && <EmptyState title="No products in this category" description="Try another category or search the full catalogue." />}</PageShell>;
}
