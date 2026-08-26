import { login, sendOtp } from './actions';
import { Card, PageShell, Input, Button } from '@novamart/ui';

export default function LoginPage() {
  return <PageShell eyebrow="Secure sign in" title="Welcome back" description="Use Supabase Auth for password or email OTP sign-in. Tokens stay in secure cookies and are never exposed to browser JavaScript."><Card style={{ maxWidth: 560 }}><form action={login} className="nm-grid"><label>Email<Input name="email" type="email" required autoComplete="email" /></label><label>Password<Input name="password" type="password" required minLength={10} autoComplete="current-password" /><input type="hidden" name="token" value="" /></label><Button type="submit">Sign in</Button></form><form action={sendOtp} className="nm-grid" style={{ marginTop: 18 }}><label>Email OTP<Input name="email" type="email" required autoComplete="email" /></label><Button type="submit" variant="secondary">Send one-time code</Button></form><p className="nm-muted" style={{ marginBottom: 0 }}>Need Google or Apple sign-in? Enable the provider in Supabase Auth configuration.</p></Card></PageShell>;
}
