import type { MetadataRoute } from 'next';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> { return [{ url: process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000', changeFrequency: 'hourly', priority: 1 }]; }
