import type { MetadataRoute } from 'next';
import { createServerApiClient } from '@novamart/api-client';

const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const client = createServerApiClient();
  const [products, categories] = await Promise.all([
    client.get<Array<{ slug: string }>>('/catalog/products?limit=500&sort=popularity').catch(() => []),
    client.get<Array<{ path: string }>>('/catalog/categories').catch(() => []),
  ]);
  return [
    { url: siteUrl, changeFrequency: 'hourly', priority: 1 },
    ...categories.map((category) => ({
      url: `${siteUrl}/category/${category.path}`,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    ...products.map((product) => ({
      url: `${siteUrl}/product/${product.slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
