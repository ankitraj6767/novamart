-- =============================================================================
-- NovaMart — 0004 Audit: append-only audit trail and security events
--
-- Append-only is enforced by triggers that raise for EVERY role, including
-- service_role. An audit log a privileged connection can rewrite is not an audit log.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- audit.audit_logs
-- One row per sensitive action. old_value/new_value hold the changed subset only,
-- not entire rows, so PII exposure stays proportional to the change.
-- -----------------------------------------------------------------------------
create table audit.audit_logs (
  id             uuid        primary key default private.uuid_generate_v7(),
  actor_id       uuid,
  actor_type     text        not null default 'USER'
                   check (actor_type in ('USER', 'SELLER_USER', 'STAFF', 'SYSTEM', 'WORKER',
                                          'PROVIDER_WEBHOOK', 'SUPPORT_AGENT')),
  actor_email    text,
  actor_roles    text[]      not null default '{}',
  -- Dotted verb matching the permission catalogue, e.g. 'seller.suspend'.
  action         text        not null
                   constraint audit_action_shape check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  resource_type  text        not null,
  resource_id    uuid,
  -- Secondary identifier when the resource is keyed by a business reference.
  resource_ref   text,
  old_value      jsonb,
  new_value      jsonb,
  -- Mandatory for actions the permission catalogue marks as reason-required
  -- (suspensions, manual refunds, price overrides, inventory adjustments).
  reason         text,
  outcome        text        not null default 'SUCCESS'
                   check (outcome in ('SUCCESS', 'FAILURE', 'DENIED')),
  severity       text        not null default 'INFO'
                   check (severity in ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  ip_address     inet,
  user_agent     text,
  device_id      text,
  request_id     text,
  trace_id       text,
  -- Free-form structured extras (affected counts, provider ids, batch ids).
  context        jsonb       not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now()
);

comment on table audit.audit_logs is
  'Append-only audit trail for sensitive actions. UPDATE and DELETE are blocked for all roles.';

create index audit_logs_actor_idx      on audit.audit_logs (actor_id, occurred_at desc);
create index audit_logs_resource_idx   on audit.audit_logs (resource_type, resource_id, occurred_at desc);
create index audit_logs_action_idx     on audit.audit_logs (action, occurred_at desc);
create index audit_logs_occurred_idx   on audit.audit_logs (occurred_at desc);
create index audit_logs_request_idx    on audit.audit_logs (request_id) where request_id is not null;
create index audit_logs_trace_idx      on audit.audit_logs (trace_id) where trace_id is not null;
create index audit_logs_critical_idx   on audit.audit_logs (occurred_at desc)
  where severity in ('WARNING', 'CRITICAL');
create index audit_logs_denied_idx     on audit.audit_logs (actor_id, occurred_at desc)
  where outcome = 'DENIED';

create trigger audit_logs_append_only
  before update or delete on audit.audit_logs
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- audit.security_events
-- Authentication and session security signals, separate from business auditing so
-- the security team can be granted one without the other.
-- -----------------------------------------------------------------------------
create table audit.security_events (
  id             uuid        primary key default private.uuid_generate_v7(),
  event_type     text        not null
                   check (event_type in ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT',
                                          'PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED',
                                          'MFA_ENROLLED', 'MFA_CHALLENGE_SUCCESS', 'MFA_CHALLENGE_FAILURE',
                                          'OTP_REQUESTED', 'OTP_VERIFY_FAILURE',
                                          'SESSION_REVOKED', 'TOKEN_REUSE_DETECTED',
                                          'PERMISSION_DENIED', 'RATE_LIMIT_EXCEEDED',
                                          'SUSPICIOUS_DEVICE', 'SUSPICIOUS_LOCATION',
                                          'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED',
                                          'ADMIN_IMPERSONATION_STARTED', 'ADMIN_IMPERSONATION_ENDED',
                                          'SENSITIVE_DOCUMENT_ACCESSED', 'BREAK_GLASS_USED',
                                          'WEBHOOK_SIGNATURE_INVALID')),
  user_id        uuid,
  -- Identifier supplied at authentication time. Stored hashed: a failed-login log
  -- must not become a directory of valid phone numbers and emails.
  identifier_hash text,
  severity       text        not null default 'INFO'
                   check (severity in ('INFO', 'NOTICE', 'WARNING', 'CRITICAL')),
  ip_address     inet,
  user_agent     text,
  device_id      text,
  app            text,
  app_version    text,
  -- Coarse geo only (city/state), derived from IP. No precise location.
  geo_city       text,
  geo_state      text,
  details        jsonb       not null default '{}'::jsonb,
  request_id     text,
  trace_id       text,
  occurred_at    timestamptz not null default now()
);

comment on column audit.security_events.identifier_hash is
  'HMAC of the login identifier. Never store raw phone/email here: failure logs must not be harvestable.';

create index security_events_user_idx     on audit.security_events (user_id, occurred_at desc);
create index security_events_type_idx     on audit.security_events (event_type, occurred_at desc);
create index security_events_ip_idx       on audit.security_events (ip_address, occurred_at desc);
create index security_events_severity_idx on audit.security_events (occurred_at desc)
  where severity in ('WARNING', 'CRITICAL');
-- Brute-force detection window.
create index security_events_failure_idx  on audit.security_events (identifier_hash, occurred_at desc)
  where event_type in ('LOGIN_FAILURE', 'OTP_VERIFY_FAILURE');

create trigger security_events_append_only
  before update or delete on audit.security_events
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- audit.data_access_logs
-- Reading sensitive data is itself an auditable event: KYC documents, bank
-- accounts, customer PII viewed by staff, exports.
-- -----------------------------------------------------------------------------
create table audit.data_access_logs (
  id             uuid        primary key default private.uuid_generate_v7(),
  actor_id       uuid        not null,
  actor_roles    text[]      not null default '{}',
  access_type    text        not null
                   check (access_type in ('VIEW', 'DOWNLOAD', 'EXPORT', 'SEARCH', 'PRINT')),
  data_category  text        not null
                   check (data_category in ('KYC_DOCUMENT', 'BANK_ACCOUNT', 'CUSTOMER_PII',
                                             'CUSTOMER_ADDRESS', 'PAYMENT_DETAIL', 'SELLER_FINANCE',
                                             'SUPPORT_ATTACHMENT', 'RETURN_EVIDENCE', 'BULK_EXPORT')),
  subject_type   text        not null,
  subject_id     uuid,
  record_count   integer     not null default 1,
  justification  text,
  ticket_id      uuid,
  ip_address     inet,
  request_id     text,
  trace_id       text,
  occurred_at    timestamptz not null default now()
);

comment on table audit.data_access_logs is
  'Records reads of sensitive data. Required for KYC, bank details, PII and bulk exports.';

create index data_access_logs_actor_idx    on audit.data_access_logs (actor_id, occurred_at desc);
create index data_access_logs_subject_idx  on audit.data_access_logs (subject_type, subject_id, occurred_at desc);
create index data_access_logs_category_idx on audit.data_access_logs (data_category, occurred_at desc);
create index data_access_logs_bulk_idx     on audit.data_access_logs (occurred_at desc)
  where access_type in ('EXPORT', 'DOWNLOAD');

create trigger data_access_logs_append_only
  before update or delete on audit.data_access_logs
  for each row execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- Write helper. Keeping insertion behind a function means the API cannot
-- accidentally omit correlation identifiers: they are read from session context.
-- -----------------------------------------------------------------------------
create or replace function audit.record(
  p_action        text,
  p_resource_type text,
  p_resource_id   uuid    default null,
  p_old_value     jsonb   default null,
  p_new_value     jsonb   default null,
  p_reason        text    default null,
  p_actor_type    text    default 'USER',
  p_severity      text    default 'INFO',
  p_context       jsonb   default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = audit, private, pg_catalog
as $$
declare
  v_id uuid;
begin
  insert into audit.audit_logs (
    actor_id, actor_type, action, resource_type, resource_id,
    old_value, new_value, reason, severity, context, request_id, trace_id
  )
  values (
    private.current_actor_id(), p_actor_type, p_action, p_resource_type, p_resource_id,
    p_old_value, p_new_value, p_reason, p_severity, p_context,
    private.current_request_id(), private.current_trace_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function audit.record(text, text, uuid, jsonb, jsonb, text, text, text, jsonb) from public;
grant execute on function audit.record(text, text, uuid, jsonb, jsonb, text, text, text, jsonb) to service_role;
