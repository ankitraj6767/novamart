import Link from 'next/link';
import { money } from '@novamart/api-client';
import { api } from '@/lib/api';
import { Badge, Card, CardHeader, EmptyState, PageShell } from '@novamart/ui';

type Product = { productId: string; slug: string; title: string; imageUrl?: string | null; price?: { paise: number; display: string } | null; mrp?: { paise: number; display: string } | null; averageRating?: number | string };
type Category = { slug: string; name: string; path: string };

export default async function Home() {
  const client = await api();
  const [home, categories, products] = await Promise.all([
    client.get<Array<{ id: string; title: string | null; subtitle: string | null; type: string; configuration: Record<string, unknown> }>>('/catalog/home').catch(() => []),
    client.get<Category[]>('/catalog/categories').catch(() => []),
    client.get<Product[]>('/catalog/products?limit=8&sort=popularity').catch(() => []),
  ]);
  const hero = home[0];
  return <PageShell title="A sharper way to shop" description="Discover dependable products, transparent prices and fulfilment you can track from checkout to doorstep." eyebrow="NovaMart / India’s trusted marketplace"><section className="nm-hero"><div><Badge tone="accent">New season, better choices</Badge><h2>{hero?.title ?? 'Big finds. Clear prices. No surprises.'}</h2><p>{hero?.subtitle ?? 'Shop across verified sellers with server-authoritative prices, real inventory and support that stays with your order.'}</p><Link className="nm-button nm-button-secondary" href="/search?q=trending">Explore what’s trending</Link></div><div className="nm-hero-art" aria-hidden="true" /></section><section className="nm-section"><CardHeader title="Shop by category" description="Curated by NovaMart, configured by our catalogue team." /><div className="nm-category-grid">{categories.slice(0, 12).map((category) => <Link className="nm-category" href={`/category/${category.path}`} key={category.slug}>{category.name}</Link>)}</div></section><section className="nm-section"><CardHeader title="Popular right now" action={<Link className="nm-button nm-button-ghost" href="/search?q=">View all →</Link>} /><div className="nm-product-grid">{products.map((product) => <ProductCard key={product.productId ?? product.slug} product={product} />)}</div>{products.length === 0 && <EmptyState title="Catalogue is warming up" description="Products will appear here as sellers publish approved listings." />}</section></PageShell>;
}

function ProductCard({ product }: { product: Product }) { return <Link href={`/product/${product.slug}`}><Card className="nm-product-card"><div className="nm-product-image">{product.imageUrl ? <img src={product.imageUrl} alt="" className="nm-product-image" /> : null}</div><div className="nm-product-copy"><h3>{product.title}</h3><span className="nm-price">{product.price?.display ?? money(0)}</span>{product.mrp && <span className="nm-price-old">{product.mrp.display}</span>}<p className="nm-muted" style={{ fontSize: 12, marginBottom: 0 }}>★ {Number(product.averageRating ?? 0).toFixed(1)} · Verified offers</p></div></Card></Link>; }
