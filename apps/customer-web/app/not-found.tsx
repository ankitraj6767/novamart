import Link from 'next/link';
import { Card } from '@novamart/ui';
export default function NotFound() { return <main className="nm-page"><Card><h1>That page has moved</h1><p className="nm-muted">Try browsing the latest NovaMart catalogue.</p><Link className="nm-button nm-button-primary" href="/">Back to home</Link></Card></main>; }
