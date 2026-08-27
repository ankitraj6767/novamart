import Image from 'next/image';
import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { addToCart } from './actions';
import { money } from '@novamart/api-client';
import { Badge, Button, Card, CardHeader, PageShell } from '@novamart/ui';

type Props = { params: Promise<{ slug: string }> };
type Product = {
  productId?: string;
  slug?: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  brandName?: string | null;
  imageUrl?: string | null;
  media?: Array<{ url: string; altText?: string | null }>;
  price?: { paise: number; display: string } | null;
  mrp?: { paise: number; display: string } | null;
  averageRating?: number;
  ratingCount?: number;
  buyBox?: {
    listingId: string;
    sellerName: string;
    availableQuantity: number;
    fulfillmentModel: string;
  } | null;
  otherOffers?: Array<{
    listingId: string;
    sellerName: string;
    price: { display: string };
    availableQuantity: number;
    fulfillmentModel: string;
  }>;
  specifications?: Array<{ group: string; items: Array<{ label: string; value: string }> }>;
  warranty?: { type: string | null; months: number | null; summary: string | null };
  returnPolicy?: { window: number; type: string; label: string };
};

async function getProduct(slug: string) {
  return (await api()).get<Product>(`/catalog/products/${encodeURIComponent(slug)}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug).catch(() => null);
  const description = product?.description ?? product?.subtitle ?? 'Shop verified products on NovaMart.';
  const image = product?.media?.[0]?.url ?? product?.imageUrl;
  return {
    title: product?.title ?? 'Product',
    description,
    alternates: { canonical: `/product/${slug}` },
    openGraph: {
      type: 'website',
      title: product?.title ?? 'NovaMart product',
      description,
      url: `/product/${slug}`,
      ...(image ? { images: [{ url: image, alt: product?.title ?? 'NovaMart product' }] } : {}),
    },
    twitter: { card: 'summary_large_image', title: product?.title ?? 'NovaMart product', description },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  const hero = product.media?.[0];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description ?? product.subtitle ?? undefined,
    brand: product.brandName ? { '@type': 'Brand', name: product.brandName } : undefined,
    image: product.media?.map((item) => item.url),
    aggregateRating:
      product.ratingCount && product.ratingCount > 0
        ? { '@type': 'AggregateRating', ratingValue: product.averageRating ?? 0, reviewCount: product.ratingCount }
        : undefined,
    offers: product.price
      ? {
          '@type': 'Offer',
          priceCurrency: 'INR',
          price: (product.price.paise / 100).toFixed(2),
          availability:
            (product.buyBox?.availableQuantity ?? 0) > 0
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          seller: product.buyBox?.sellerName
            ? { '@type': 'Organization', name: product.buyBox.sellerName }
            : undefined,
        }
      : undefined,
  };

  return (
    <PageShell eyebrow="Product details" title={product.title} description={product.subtitle ?? undefined}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="nm-detail">
        <div className="nm-detail-media">
          {hero ? (
            <Image src={hero.url} alt={hero.altText ?? product.title} width={900} height={900} unoptimized priority />
          ) : (
            <span className="nm-muted">Media coming soon</span>
          )}
        </div>
        <div className="nm-detail-copy">
          <Badge tone="success">Buy box protected</Badge>
          <h1>{product.title}</h1>
          <p>{product.description ?? 'Verified catalogue information from NovaMart sellers.'}</p>
          <div className="nm-detail-price">
            {product.price?.display ?? money(0)}{' '}
            {product.mrp && <span className="nm-price-old">{product.mrp.display}</span>}
          </div>
          <p className="nm-muted">
            ★ {Number(product.averageRating ?? 0).toFixed(1)} ({product.ratingCount ?? 0} reviews)
          </p>
          <Card>
            <p>
              <strong>{product.buyBox?.sellerName ?? 'Verified NovaMart seller'}</strong>
              <br />
              <span className="nm-muted">
                {product.buyBox?.fulfillmentModel ?? 'Tracked fulfilment'} ·{' '}
                {product.buyBox?.availableQuantity ?? 0} available
              </span>
            </p>
            <form action={addToCart} className="nm-actions">
              <input type="hidden" name="listingId" value={product.buyBox?.listingId ?? ''} />
              <input className="nm-input" name="quantity" type="number" min="1" max="100" defaultValue="1" aria-label="Quantity" style={{ width: 90 }} />
              <Button type="submit" disabled={!product.buyBox?.listingId}>Add to cart</Button>
              <Link className="nm-button nm-button-secondary" href="/cart">Go to cart</Link>
            </form>
          </Card>
        </div>
      </div>
      {product.otherOffers && product.otherOffers.length > 0 && (
        <section className="nm-section">
          <CardHeader title="Other verified sellers" />
          <div className="nm-grid nm-grid-3">
            {product.otherOffers.map((offer) => (
              <Card key={offer.listingId}>
                <h3>{offer.sellerName}</h3>
                <p className="nm-price">{offer.price.display}</p>
                <p className="nm-muted">{offer.fulfillmentModel} · {offer.availableQuantity} available</p>
              </Card>
            ))}
          </div>
        </section>
      )}
      <section className="nm-section">
        <CardHeader title="Specifications" />
        {product.specifications?.map((group) => (
          <Card key={group.group}>
            <h3>{group.group}</h3>
            {group.items.map((item) => (
              <p className="nm-muted" key={item.label}><strong>{item.label}</strong> · {item.value}</p>
            ))}
          </Card>
        ))}
        {(product.warranty || product.returnPolicy) && (
          <Card>
            {product.warranty && <p><strong>Warranty:</strong> {product.warranty.summary ?? `${product.warranty.months ?? 0} months`}</p>}
            {product.returnPolicy && <p><strong>Returns:</strong> {product.returnPolicy.label}</p>}
          </Card>
        )}
      </section>
    </PageShell>
  );
}
