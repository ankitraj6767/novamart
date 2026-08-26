import Link from 'next/link';
import './globals.css';
export const metadata = { title: { default: 'Seller Center | NovaMart', template: '%s | Seller Center' }, description: 'Manage NovaMart catalog, orders, inventory and finance.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en-IN"><body><div className="nm-console"><nav className="nm-nav nm-console-nav"><Link className="nm-brand" href="/"><span className="nm-brand-mark">N</span>Seller Center</Link><div className="nm-nav-links"><Link href="/orders">Orders</Link><Link href="/catalog">Catalog</Link><Link href="/inventory">Inventory</Link><Link href="/finance">Finance</Link></div></nav>{children}</div></body></html>; }
