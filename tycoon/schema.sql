-- AERVELYS Tycoon: isolated schema. DO NOT automatically apply to existing production databases.
-- Internal server-only schema; no GRANT to anon/authenticated.
begin;
create schema if not exists tycoon;
create table if not exists tycoon.companies (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null,
 name text not null default 'Aervelys Business Aviation',
 home_icao text not null default 'EDAZ',
 start_capital_cents bigint not null default 2500000 check(start_capital_cents>=0),
 aoc_status text not null default 'not_applied',
 created_at timestamptz not null default now()
);
create table if not exists tycoon.partners (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references tycoon.companies(id),
 name text not null, activity text not null, verification text not null default 'simulation',
 source_url text, observed_at timestamptz, relationship text not null default 'none'
);
create table if not exists tycoon.customers (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references tycoon.companies(id),
 name text not null, budget_band text, reliability integer not null default 50 check(reliability between 0 and 100),
 satisfaction integer not null default 50 check(satisfaction between 0 and 100),
 last_trip_at timestamptz, next_need_at timestamptz, is_simulated boolean not null default true
);
create table if not exists tycoon.contracts (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references tycoon.companies(id),
 counterpart_name text not null, category text not null, status text not null default 'draft',
 starts_at timestamptz, ends_at timestamptz, amount_cents bigint,
 signed_at timestamptz, terms jsonb not null default '{}'::jsonb
);
create table if not exists tycoon.projects (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references tycoon.companies(id),
 category text not null, location text, state text not null default 'idea',
 submitted_at timestamptz, decision_due_at timestamptz, data jsonb not null default '{}'::jsonb
);
create table if not exists tycoon.events (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references tycoon.companies(id),
 event_type text not null, due_at timestamptz not null, status text not null default 'pending',
 idempotency_key text not null, payload jsonb not null default '{}'::jsonb,
 processed_at timestamptz, unique(company_id,idempotency_key)
);
create index if not exists idx_tycoon_events_due on tycoon.events(due_at) where status='pending';
create table if not exists tycoon.ledger (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references tycoon.companies(id),
 occurred_at timestamptz not null default now(),
 account_code text not null, amount_cents bigint not null,
 idempotency_key text not null, description text not null,
 unique(company_id,idempotency_key,account_code)
);
create table if not exists tycoon.audit_log (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references tycoon.companies(id),
 actor_user_id uuid, action text not null, subject_id uuid, created_at timestamptz not null default now(),
 details jsonb not null default '{}'::jsonb
);
alter table tycoon.companies enable row level security;
alter table tycoon.partners enable row level security;
alter table tycoon.customers enable row level security;
alter table tycoon.contracts enable row level security;
alter table tycoon.projects enable row level security;
alter table tycoon.events enable row level security;
alter table tycoon.ledger enable row level security;
alter table tycoon.audit_log enable row level security;
revoke all on schema tycoon from public, anon, authenticated;
revoke all on all tables in schema tycoon from public, anon, authenticated;
commit;
