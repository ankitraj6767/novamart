import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000';

export const metadata: Metadata = {
  title: { default: 'NovaMart — Shop with confidence', template: '%s | NovaMart' },
  description: 'A trusted Indian multi-vendor marketplace.',
  metadataBase: new URL(siteUrl),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'NovaMart',
    title: 'NovaMart — Shop with confidence',
    description: 'Verified sellers, clear prices and delivery you can follow.',
    url: siteUrl,
  },
  twitter: { card: 'summary_large_image', title: 'NovaMart — Shop with confidence' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0d7773' };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body><div className="nm-storefront"><nav className="nm-nav"><Link className="nm-brand" href="/"><span className="nm-brand-mark">N</span>NovaMart</Link><form action="/search" className="nm-search"><input className="nm-input" name="q" placeholder="Search products, brands and more" aria-label="Search products" /></form><div className="nm-nav-links"><Link href="/orders">Orders</Link><Link href="/account">Account</Link><Link href="/cart">Cart</Link></div></nav>{children}<footer className="nm-page nm-muted" style={{ paddingBottom: 24, fontSize: 13 }}>© {new Date().getFullYear()} NovaMart · Built for India · <Link href="/support">Help & support</Link></footer></div></body></html>;
}
