import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NovaMart',
    short_name: 'NovaMart',
    description: 'A trusted Indian multi-vendor marketplace.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f7f6',
    theme_color: '#0d7773',
    lang: 'en-IN',
    categories: ['shopping', 'lifestyle'],
  };
}
