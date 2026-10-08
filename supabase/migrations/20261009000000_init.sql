-- looot-crm schema. One workspace per sign-in: every row belongs to auth.uid().
-- Row level security is enabled and forced on every table. Nothing is readable by anon.

create extension if not exists pgcrypto;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  name text not null,
  domain text not null check (domain = lower(domain) and domain !~ '[/:@\s]'),
  industry text,
  employees int,
  hq text,
  description text,
  linkedin_url text,
  tech text[] not null default '{}',
  watched_pages text[] not null default '{}',
  score int not null default 0 check (score between 0 and 100),
  score_updated_at timestamptz,
  intent_checked_at timestamptz,
  enriched_at timestamptz,
  updated_at timestamptz,
  unique (owner_id, domain),
  unique (id, owner_id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  company_id uuid,
  first_name text,
  last_name text,
  title text,
  email text,
  email_status text not null default 'unchecked' check (email_status in ('unchecked','verified','risky','invalid','not_found')),
  email_checked_at timestamptz,
  phone text,
  phone_found_at timestamptz,
  linkedin_url text,
  source text not null default 'manual' check (source in ('manual','csv','looot')),
  unique (id, owner_id),
  foreign key (company_id, owner_id) references public.companies (id, owner_id) on delete cascade
);
create unique index contacts_owner_linkedin on public.contacts (owner_id, linkedin_url) where linkedin_url is not null;
create index contacts_owner_company on public.contacts (owner_id, company_id);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  company_id uuid not null,
  name text not null,
  stage text not null default 'lead' check (stage in ('lead','qualified','demo','proposal','won','lost')),
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  currency text not null default 'USD',
  close_date date,
  next_step text,
  next_step_due date,
  position double precision not null default 0,
  closed_reason text,
  stage_changed_at timestamptz,
  unique (id, owner_id),
  foreign key (company_id, owner_id) references public.companies (id, owner_id) on delete cascade
);
create index deals_owner_stage on public.deals (owner_id, stage, position);

create table public.deal_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  deal_id uuid not null,
  contact_id uuid not null,
  role text not null default 'other' check (role in ('champion','buyer','user','other')),
  unique (deal_id, contact_id),
  foreign key (deal_id, owner_id) references public.deals (id, owner_id) on delete cascade,
  foreign key (contact_id, owner_id) references public.contacts (id, owner_id) on delete cascade
);
create index deal_contacts_owner on public.deal_contacts (owner_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  company_id uuid,
  contact_id uuid references public.contacts (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,
  kind text not null check (kind in ('note','call','meeting','task','stage_change','enrichment')),
  body text,
  due_at timestamptz,
  done_at timestamptz,
  meta jsonb not null default '{}',
  foreign key (company_id, owner_id) references public.companies (id, owner_id) on delete cascade
);
create index activities_owner_company on public.activities (owner_id, company_id, created_at desc);
create index activities_open_tasks on public.activities (owner_id, due_at) where kind = 'task' and done_at is null;

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  action_key text not null,
  kind text not null check (kind in ('intent_refresh','contact_enrich','company_enrich','find_people','email_verify')),
  target_count int not null default 1,
  target_label text,
  estimate_usd numeric(10,6) not null default 0,
  max_cost_usd numeric(10,6) not null check (max_cost_usd >= 0),
  actual_usd numeric(10,6) not null default 0,
  status text not null default 'running' check (status in ('running','done','partial','failed','stopped_at_max')),
  finished_at timestamptz,
  unique (owner_id, action_key),
  unique (id, owner_id),
  -- The money rule, enforced by the database: an action can never record more than the user confirmed.
  constraint actions_actual_within_max check (actual_usd <= max_cost_usd)
);
create index actions_owner_created on public.actions (owner_id, created_at desc);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  action_id uuid not null,
  job_id text not null,
  step text,
  target_type text,
  target_id uuid,
  idempotency_key text not null,
  looot_run_id text,
  status text,
  outcome text check (outcome in ('data','no_result','failed','skipped')),
  cap_usd numeric(10,6),
  cost_usd numeric(10,6) not null default 0,
  error text,
  note text,
  unique (owner_id, idempotency_key),
  unique (id, owner_id),
  foreign key (action_id, owner_id) references public.actions (id, owner_id) on delete cascade
);
create index runs_owner_target on public.runs (owner_id, target_id, created_at desc);
create index runs_action on public.runs (action_id);

create table public.signals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  company_id uuid not null,
  kind text not null check (kind in ('hiring','funding','tech','news','site')),
  title text not null,
  url text,
  detail text,
  tag text,
  occurred_at timestamptz not null,
  points int not null,
  dedupe_key text not null,
  run_id uuid references public.runs (id) on delete set null,
  read_at timestamptz,
  unique (owner_id, company_id, kind, dedupe_key),
  foreign key (company_id, owner_id) references public.companies (id, owner_id) on delete cascade
);
create index signals_owner_unread on public.signals (owner_id, read_at, occurred_at desc);

create table public.signal_baselines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  company_id uuid not null,
  kind text not null,
  key text not null,
  hash text,
  content text,
  checked_at timestamptz,
  unique (owner_id, company_id, kind, key),
  foreign key (company_id, owner_id) references public.companies (id, owner_id) on delete cascade
);

create table public.score_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  company_id uuid not null,
  score int not null,
  breakdown jsonb not null default '{}',
  at timestamptz not null default now(),
  foreign key (company_id, owner_id) references public.companies (id, owner_id) on delete cascade
);
create index score_history_owner_company on public.score_history (owner_id, company_id, at);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  role_keywords text[] not null default '{}',
  default_pages text[] not null default '{/pricing,/careers}',
  weights jsonb not null default '{"funding":30,"hiring":8,"tech":10,"news_tagged":6,"news_other":2,"site":5}',
  action_ceiling_usd numeric(10,6),
  unique (owner_id)
);

-- Row level security: four policies per table, all on owner_id = auth.uid().
do $$
declare t text;
begin
  foreach t in array array['companies','contacts','deals','deal_contacts','activities','actions','runs','signals','signal_baselines','score_history','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t || '_delete', t);
    execute format('create index if not exists %I on public.%I (owner_id)', t || '_owner', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
