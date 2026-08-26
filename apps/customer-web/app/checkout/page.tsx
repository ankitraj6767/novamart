import { startCheckout } from './actions';
import { Card, PageShell, Button } from '@novamart/ui';
export default function CheckoutPage() { return <PageShell eyebrow="Secure checkout" title="Checkout" description="The API owns final pricing, inventory reservation, serviceability and payment confirmation."><Card><h2>Start a protected checkout session</h2><p className="nm-muted">NovaMart will re-read your cart and reserve stock before showing the authoritative amount.</p><form action={startCheckout}><Button type="submit">Review cart and delivery</Button></form></Card></PageShell>; }
