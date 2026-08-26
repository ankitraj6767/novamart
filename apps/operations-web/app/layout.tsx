import Link from 'next/link';
import './globals.css';
export const metadata = { title: { default: 'NovaMart Operations', template: '%s | Operations' }, description: 'Warehouse and fulfilment operations.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en-IN"><body><div className="nm-console"><nav className="nm-nav nm-console-nav"><Link className="nm-brand" href="/"><span className="nm-brand-mark">N</span>Operations</Link><div className="nm-nav-links"><Link href="/shipments">Shipments</Link><Link href="/returns">Returns</Link><Link href="/inventory">Inventory</Link></div></nav>{children}</div></body></html>; }
