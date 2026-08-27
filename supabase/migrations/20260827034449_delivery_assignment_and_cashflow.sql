-- Internal delivery assignments are explicit so a partner can only see and act on
-- shipments assigned to their authenticated profile.
alter table fulfillment.shipments
  add column if not exists delivery_agent_id uuid references identity.profiles (id) on delete set null;

create index if not exists shipments_delivery_agent_idx
  on fulfillment.shipments (delivery_agent_id, status, created_at desc)
  where delivery_agent_id is not null;

comment on column fulfillment.shipments.delivery_agent_id is
  'Internal delivery partner assignment. Carrier shipments may remain unassigned.';
