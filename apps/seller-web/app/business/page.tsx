import { sellerId, sellerRead, StatusCard } from '../_components';
import { Card, PageShell } from '@novamart/ui';

export default async function SellerBusiness() {
  const id = sellerId();
  const profile = await sellerRead<Record<string, unknown>>(`/sellers/${id}`, {});
  return <PageShell eyebrow="Business details" title="Seller account" description="Legal, tax, bank and onboarding state are verified before an account can transact."><div className="nm-grid nm-grid-2"><Card><h2>{String(profile['display_name'] ?? 'Seller account')}</h2><p className="nm-muted">{String(profile['legal_name'] ?? 'Legal name not configured')} · {String(profile['business_type'] ?? 'Business type pending')}</p><p>Status: <strong>{String(profile['status'] ?? 'NOT_CONFIGURED')}</strong></p><p>Onboarding: <strong>{String(profile['onboarding_step'] ?? '—')}</strong></p></Card><StatusCard label="Transactable" value={profile['is_transactable'] ? 'Yes' : 'Not yet'} detail="Approval, verified bank, documents and pickup location are required." tone={profile['is_transactable'] ? 'success' : 'warning'} /></div></PageShell>;
}
