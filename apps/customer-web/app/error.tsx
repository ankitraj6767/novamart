'use client';
import { Button, Card } from '@novamart/ui';
export default function Error({ reset }: { reset: () => void }) { return <main className="nm-page"><Card><h1>Something went wrong</h1><p className="nm-muted">We could not load this page. Your cart and orders are safe.</p><Button onClick={reset}>Try again</Button></Card></main>; }
