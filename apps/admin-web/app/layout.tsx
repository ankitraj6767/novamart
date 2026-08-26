import Link from 'next/link';
import './globals.css';
export const metadata = { title: { default: 'NovaMart Admin', template: '%s | NovaMart Admin' }, description: 'NovaMart control centre.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en-IN"><body><div className="nm-console"><nav className="nm-nav nm-console-nav"><Link className="nm-brand" href="/"><span className="nm-brand-mark">N</span>Admin control centre</Link><div className="nm-nav-links"><Link href="/sellers">Sellers</Link><Link href="/settings">Settings</Link><Link href="/content">CMS</Link><Link href="/risk">Risk</Link></div></nav>{children}</div></body></html>; }
