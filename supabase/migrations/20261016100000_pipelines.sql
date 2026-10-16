-- Pipelines. A workspace can run several boards, each with its own stages, for example sales,
-- partnerships, sponsors or applicants. A deal belongs to one pipeline and sits in one of its stages.
--
-- - pipelines: name, order, what a card is about (a company or a person), whether deals carry an
--   amount, and the currency of that amount.
-- - pipeline_stages: key (stable, used by deals.stage), label (what people see, can change), order,
--   and kind: open, won or lost. Won and lost stages close a deal.
-- - deals.pipeline_id, and a foreign key from (pipeline_id, stage) to the stage, so a deal can only
--   be in a stage of its own pipeline. A stage that still has deals cannot be deleted.
-- - deals.contact_id: the person a deal is about, for pipelines of people. company_id becomes
--   optional. A deal needs a company or a person.
--
-- Existing data: every workspace with deals gets a "Sales" pipeline with the six stages of 0.1.x
-- (lead, qualified, demo, proposal, won, lost) and every deal moves into it unchanged. A deal
-- inserted without a pipeline goes to the workspace's first pipeline, which is created the same way
-- when the workspace has none. The app creates it too the first time the board is opened.

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace() references public.workspaces (id) on delete cascade,
  owner_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 60),
  position double precision not null default 0,
  subject text not null default 'company' check (subject in ('company', 'person')),
  track_amount boolean not null default true,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  unique (workspace_id, name),
  unique (id, workspace_id)
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace() references public.workspaces (id) on delete cascade,
  owner_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  pipeline_id uuid not null,
  key text not null check (key ~ '^[a-z0-9_]{1,40}$'),
  label text not null check (char_length(label) between 1 and 40),
  position double precision not null default 0,
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  unique (pipeline_id, key),
  unique (workspace_id, pipeline_id, key),
  foreign key (pipeline_id, workspace_id) references public.pipelines (id, workspace_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['pipelines', 'pipeline_stages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (workspace_id = (select public.current_workspace()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (workspace_id = (select public.current_workspace()) and owner_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (workspace_id = (select public.current_workspace())) with check (workspace_id = (select public.current_workspace()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (workspace_id = (select public.current_workspace()))', t || '_delete', t);
    execute format('create index %I on public.%I (workspace_id)', t || '_workspace', t);
    execute format('create index %I on public.%I (owner_id)', t || '_owner', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- The first pipeline of a workspace, created with the six 0.1.x stages when there is none. Runs with
-- the caller's rights, so a user can only create it in their own workspace.
create function public.default_pipeline(p_workspace uuid) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select p.id into v_id from public.pipelines p where p.workspace_id = p_workspace order by p.position, p.created_at limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.pipelines (workspace_id, name, position) values (p_workspace, 'Sales', 1000)
    on conflict (workspace_id, name) do nothing
    returning id into v_id;
  if v_id is null then
    -- Another transaction created it first.
    select p.id into v_id from public.pipelines p where p.workspace_id = p_workspace and p.name = 'Sales';
    return v_id;
  end if;
  insert into public.pipeline_stages (workspace_id, pipeline_id, key, label, position, kind) values
    (p_workspace, v_id, 'lead', 'Lead', 1000, 'open'),
    (p_workspace, v_id, 'qualified', 'Qualified', 2000, 'open'),
    (p_workspace, v_id, 'demo', 'Demo', 3000, 'open'),
    (p_workspace, v_id, 'proposal', 'Proposal', 4000, 'open'),
    (p_workspace, v_id, 'won', 'Won', 5000, 'won'),
    (p_workspace, v_id, 'lost', 'Lost', 6000, 'lost');
  return v_id;
end;
$$;
revoke execute on function public.default_pipeline(uuid) from public, anon;
grant execute on function public.default_pipeline(uuid) to authenticated;

-- Deals: pipeline, person, and the stage checked against the pipeline instead of a fixed list.
alter table public.deals add column pipeline_id uuid;
alter table public.deals add column contact_id uuid;
update public.deals d set pipeline_id = public.default_pipeline(d.workspace_id);
alter table public.deals alter column pipeline_id set not null;
alter table public.deals drop constraint deals_stage_check;
alter table public.deals alter column company_id drop not null;
alter table public.deals add constraint deals_company_or_person check (company_id is not null or contact_id is not null);
alter table public.deals add foreign key (pipeline_id, workspace_id) references public.pipelines (id, workspace_id);
-- No cascade: a stage or a pipeline with deals in it cannot be deleted. Keys never change in the app,
-- but a key renamed in SQL carries its deals with it.
alter table public.deals add constraint deals_stage_in_pipeline foreign key (pipeline_id, stage) references public.pipeline_stages (pipeline_id, key) on update cascade;
alter table public.deals add foreign key (contact_id, workspace_id) references public.contacts (id, workspace_id) on delete cascade;
drop index public.deals_workspace_stage;
create index deals_workspace_pipeline_stage on public.deals (workspace_id, pipeline_id, stage, position);
create index deals_contact on public.deals (contact_id) where contact_id is not null;

-- A deal inserted without a pipeline goes to the first one. Keeps 0.1.x clients and imports working.
create function public.deals_default_pipeline() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pipeline_id is null then
    new.pipeline_id := public.default_pipeline(new.workspace_id);
  end if;
  return new;
end;
$$;
revoke execute on function public.deals_default_pipeline() from public, anon;
create trigger deals_default_pipeline before insert on public.deals for each row execute function public.deals_default_pipeline();
