import Link from 'next/link';
import './globals.css';
export const metadata = { title: { default: 'NovaMart Support', template: '%s | Support' }, description: 'Customer and seller support console.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en-IN"><body><div className="nm-console"><nav className="nm-nav nm-console-nav"><Link className="nm-brand" href="/"><span className="nm-brand-mark">N</span>Support console</Link><div className="nm-nav-links"><Link href="/tickets">Tickets</Link><Link href="/help">Help centre</Link></div></nav>{children}</div></body></html>; }
