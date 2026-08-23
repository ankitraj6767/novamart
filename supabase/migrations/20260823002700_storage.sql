-- =============================================================================
-- NovaMart — 0027 Storage buckets and object policies
--
-- Public buckets hold only content that is meant to be on the open internet.
-- Everything customer-, seller- or dispute-related lives in a private bucket and is
-- served through short-lived signed URLs issued by the API after an authorization
-- check (SECURITY_MODEL §6).
--
-- Uploads are always server-mediated: the API validates MIME type, size and the
-- caller's right to write the path, then issues a signed upload URL. The INSERT
-- policies below are the second line of defence.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('products-public',   'products-public',   true,   8388608,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('brands-public',     'brands-public',     true,   2097152,
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('categories-public', 'categories-public', true,   2097152,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('reviews-public',    'reviews-public',    true,  26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),

  ('seller-private',    'seller-private',    false, 52428800,
    array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel', 'image/jpeg', 'image/png', 'application/pdf']),
  ('kyc-private',       'kyc-private',       false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png']),
  ('returns-private',   'returns-private',   false, 26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  ('support-private',   'support-private',   false, 26214400,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'video/mp4']),
  ('invoices-private',  'invoices-private',  false,  5242880,
    array['application/pdf']),
  ('documents-private', 'documents-private', false, 26214400,
    array['application/pdf', 'image/jpeg', 'image/png', 'application/zip'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Public buckets: world-readable, staff-writable only.
-- Sellers upload product media through the API, which writes with the service role
-- after validating and re-encoding the image.
-- -----------------------------------------------------------------------------
create policy "public buckets are readable by anyone"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('products-public', 'brands-public', 'categories-public', 'reviews-public'));

create policy "catalog staff write public catalog media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('products-public', 'brands-public', 'categories-public')
    and identity.has_permission('product.manage')
  );

create policy "catalog staff update public catalog media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('products-public', 'brands-public', 'categories-public')
    and identity.has_permission('product.manage')
  );

create policy "catalog staff delete public catalog media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('products-public', 'brands-public', 'categories-public')
    and identity.has_permission('product.manage')
  );

-- Review media: a customer may upload into their own folder. Path convention is
-- reviews/{user_id}/{uuid}.{ext}, so the second path segment is the owner.
create policy "customers upload their own review media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'reviews-public'
    and (storage.foldername(name))[1] = 'reviews'
    and (storage.foldername(name))[2] = identity.current_user_id()::text
  );

create policy "customers delete their own review media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'reviews-public'
    and (storage.foldername(name))[2] = identity.current_user_id()::text
  );

-- -----------------------------------------------------------------------------
-- kyc-private: the most sensitive bucket in the platform.
-- A seller user may upload into their own seller's folder. Reads go exclusively
-- through the API so that every access is written to audit.data_access_logs;
-- there is deliberately NO direct SELECT policy for staff.
-- Path convention: kyc/{seller_id}/{document_type}/{uuid}.{ext}
-- -----------------------------------------------------------------------------
create policy "seller users upload their own KYC documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kyc-private'
    and (storage.foldername(name))[1] = 'kyc'
    and identity.has_scoped_permission(
          'seller_document.upload', 'seller',
          ((storage.foldername(name))[2])::uuid)
  );

-- Note: KYC uploads are scoped to the seller's own folder by the policy above.
-- There is deliberately no SELECT policy for this bucket: reads happen only through
-- the API, which issues a short-lived signed URL and writes an audit.data_access_logs
-- entry for every access.

-- -----------------------------------------------------------------------------
-- seller-private: bulk import files, seller working documents.
-- Path convention: seller/{seller_id}/...
-- -----------------------------------------------------------------------------
create policy "seller users read their own private objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'seller-private'
    and (storage.foldername(name))[1] = 'seller'
    and identity.has_seller_scope(((storage.foldername(name))[2])::uuid)
  );

create policy "seller users write their own private objects"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'seller-private'
    and (storage.foldername(name))[1] = 'seller'
    and identity.has_seller_scope(((storage.foldername(name))[2])::uuid)
  );

create policy "seller users delete their own private objects"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'seller-private'
    and (storage.foldername(name))[1] = 'seller'
    and identity.has_seller_scope(((storage.foldername(name))[2])::uuid)
  );

-- -----------------------------------------------------------------------------
-- returns-private: customer evidence and QC photos.
-- Path convention: returns/{return_request_id}/{uuid}.{ext}
-- -----------------------------------------------------------------------------
create policy "return participants read return evidence"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'returns-private'
    and exists (
      select 1 from returns.return_requests rr
       where rr.id = ((storage.foldername(name))[2])::uuid
         and (rr.user_id = identity.current_user_id()
              or identity.has_seller_scope(rr.seller_id)
              or identity.has_permission('return.read'))
    )
  );

create policy "customers upload return evidence"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'returns-private'
    and (storage.foldername(name))[1] = 'returns'
    and exists (
      select 1 from returns.return_requests rr
       where rr.id = ((storage.foldername(name))[2])::uuid
         and rr.user_id = identity.current_user_id()
    )
  );

-- -----------------------------------------------------------------------------
-- support-private: ticket attachments.
-- Path convention: tickets/{ticket_id}/{uuid}.{ext}
-- -----------------------------------------------------------------------------
create policy "ticket participants read attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'support-private'
    and exists (
      select 1 from support.support_tickets t
       where t.id = ((storage.foldername(name))[2])::uuid
         and (t.requester_id = identity.current_user_id()
              or (t.seller_id is not null and identity.has_seller_scope(t.seller_id))
              or t.assigned_to = identity.current_user_id()
              or identity.has_permission('ticket.read'))
    )
  );

create policy "ticket participants upload attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'support-private'
    and (storage.foldername(name))[1] = 'tickets'
    and exists (
      select 1 from support.support_tickets t
       where t.id = ((storage.foldername(name))[2])::uuid
         and (t.requester_id = identity.current_user_id()
              or (t.seller_id is not null and identity.has_seller_scope(t.seller_id)))
    )
  );

-- -----------------------------------------------------------------------------
-- invoices-private: the buyer and the issuing seller may read their own invoice.
-- Path convention: invoices/{seller_id}/{financial_year}/{invoice_id}.pdf
-- -----------------------------------------------------------------------------
create policy "invoice parties read invoices"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'invoices-private'
    and exists (
      select 1 from finance.invoices i
       where i.storage_path = storage.objects.name
         and (i.user_id = identity.current_user_id()
              or identity.has_seller_scope(i.seller_id)
              or identity.has_permission('invoice.read'))
    )
  );

-- -----------------------------------------------------------------------------
-- documents-private: shipping labels, agreements, internal documents.
-- Staff-only, and only with an explicit permission. Sellers reach their labels
-- through the API, which issues a signed URL.
-- -----------------------------------------------------------------------------
create policy "staff read internal documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents-private'
    and identity.has_permission('document.read')
  );

-- -----------------------------------------------------------------------------
-- Path conventions for private buckets.
--
-- Every client-facing INSERT policy above pins the first path segment, so objects
-- cannot be scattered into paths the read policies do not cover. Server-side writes
-- (labels, invoices, statements) use the service role and are validated by the API's
-- Zod schema for storage paths in packages/validation.
--
--   kyc-private        kyc/{seller_id}/{document_type}/{uuid}.{ext}
--   seller-private     seller/{seller_id}/{purpose}/{uuid}.{ext}
--   returns-private    returns/{return_request_id}/{uuid}.{ext}
--   support-private    tickets/{ticket_id}/{uuid}.{ext}
--   invoices-private   invoices/{seller_id}/{financial_year}/{invoice_id}.pdf
--   documents-private  labels|agreements|internal/{entity_id}/{uuid}.{ext}
--   reviews-public     reviews/{user_id}/{uuid}.{ext}
--   products-public    products/{product_id}/{uuid}.{ext}
--
-- A database trigger on storage.objects would be the stronger guard, but
-- storage.objects is owned by supabase_storage_admin and is not ours to attach
-- triggers to. The policies plus server-side validation are the enforcement points.
-- -----------------------------------------------------------------------------
