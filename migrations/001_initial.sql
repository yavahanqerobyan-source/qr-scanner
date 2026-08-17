create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists content_items (
  kind text not null check (kind in ('portfolio', 'product')),
  id text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  published boolean not null default false,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (kind, id)
);

create index if not exists content_items_public_idx
  on content_items (kind, sort_order)
  where published = true and deleted_at is null;

create table if not exists leads (
  id uuid primary key,
  type text not null check (type in ('portrait', 'certificate', 'product')),
  status text not null default 'new' check (status in ('new', 'contacted', 'in_progress', 'completed', 'archived')),
  channel text not null default 'telegram' check (channel in ('telegram', 'max', 'phone', 'site')),
  title text not null,
  product_id text,
  encrypted_payload text not null,
  consent_version text not null,
  consent_at timestamptz not null,
  source text not null default 'website',
  retention_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists leads_status_created_idx
  on leads (status, created_at desc)
  where deleted_at is null;

create index if not exists leads_retention_idx
  on leads (retention_until)
  where deleted_at is null;

create table if not exists consent_records (
  id bigint generated always as identity primary key,
  lead_id uuid references leads(id) on delete cascade,
  visitor_id uuid,
  consent_type text not null check (consent_type in ('personal_data', 'analytics')),
  document_version text not null,
  document_url text not null,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  granted_at timestamptz not null,
  revoked_at timestamptz,
  check (lead_id is not null or visitor_id is not null)
);

create index if not exists consent_records_lead_id_idx on consent_records (lead_id);
create unique index if not exists consent_records_analytics_unique_idx
  on consent_records (visitor_id, consent_type, document_version)
  where visitor_id is not null and revoked_at is null;

create table if not exists analytics_events (
  id bigint generated always as identity primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  name text not null,
  page text not null,
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  retention_until timestamptz not null
);

create index if not exists analytics_events_name_occurred_idx on analytics_events (name, occurred_at desc);
create index if not exists analytics_events_visitor_occurred_idx on analytics_events (visitor_id, occurred_at desc);
create index if not exists analytics_events_retention_idx on analytics_events (retention_until);

create table if not exists admin_audit_log (
  id bigint generated always as identity primary key,
  administrator text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on admin_audit_log (created_at desc);
