-- Team workspaces. Rows belong to a workspace instead of to the sign-in that created them, so a
-- small team works on the same companies, people, deals and budget.
--
-- - workspaces: one per team. workspace_members: who is in it, by email, with a role (owner, member).
-- - A person is in one workspace at a time. The first sign-in of someone with no invitation creates a
--   workspace with them as the owner, which is how the app behaved before (one workspace per sign-in).
-- - The owner invites by email. The invitation is claimed by join_workspace() when that email signs
--   in, and only once the email is confirmed.
-- - Every data table gets workspace_id. Row level security compares it with current_workspace(), and
--   the composite foreign keys now pair each reference with workspace_id, so a row can point at any
--   row of its own workspace and at nothing outside it.
-- - owner_id stays and means "created by". It is set to auth.uid() on insert and set to null if
--   that user is deleted, so a member leaving does not delete the team's rows.
-- - The daily and monthly budget is per workspace. Only the owner changes it.
--
-- Existing data: every user with an email gets a workspace of their own as its owner, and their rows
-- move into it. Nothing is shared until an owner invites someone. The budget functions now take the
-- workspace id instead of the user id, so deploy the app version that ships with this file.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null default 'Workspace' check (char_length(name) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  -- Null until the invited email signs in and claims the invitation.
  user_id uuid unique references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz,
  -- One workspace per person.
  unique (email)
);
create index workspace_members_workspace on public.workspace_members (workspace_id);

-- The workspace of the signed-in user, or null. Security definer so policies can read the member
-- table without a policy loop. Used by every policy and as the default of every workspace_id column.
create function public.current_workspace() returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id from public.workspace_members m where m.user_id = auth.uid();
$$;

-- 'owner', 'member' or null.
create function public.workspace_role() returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.workspace_members m where m.user_id = auth.uid();
$$;

-- Existing users: one workspace each, with themselves as the owner.
insert into public.workspaces (created_by) select u.id from auth.users u where u.email is not null;
insert into public.workspace_members (workspace_id, email, user_id, role, joined_at)
  select w.id, lower(u.email), u.id, 'owner', now() from public.workspaces w join auth.users u on u.id = w.created_by;

-- Data tables: add workspace_id, fill it from the owner, and replace the owner policies and foreign keys.
do $$
declare
  t text;
  c record;
begin
  foreach t in array array['companies','contacts','deals','deal_contacts','activities','actions','runs','signals','signal_baselines','score_history','settings','budget_reservations'] loop
    execute format('alter table public.%I add column workspace_id uuid references public.workspaces (id) on delete cascade', t);
    execute format('update public.%I x set workspace_id = m.workspace_id from public.workspace_members m where m.user_id = x.owner_id', t);
    execute format('alter table public.%I alter column workspace_id set not null', t);
    execute format('alter table public.%I alter column workspace_id set default public.current_workspace()', t);

    -- Every foreign key that includes owner_id: the composite ones and the one to auth.users.
    for c in
      select con.conname from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attname = 'owner_id'
      where con.conrelid = format('public.%I', t)::regclass and con.contype = 'f' and a.attnum = any (con.conkey)
    loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    execute format('alter table public.%I alter column owner_id drop not null', t);
    execute format('alter table public.%I add constraint %I foreign key (owner_id) references auth.users (id) on delete set null', t, t || '_owner_id_fkey');

    execute format('drop policy %I on public.%I', t || '_select', t);
    execute format('drop policy %I on public.%I', t || '_insert', t);
    execute format('drop policy %I on public.%I', t || '_update', t);
    execute format('drop policy %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (workspace_id = (select public.current_workspace()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (workspace_id = (select public.current_workspace()) and owner_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (workspace_id = (select public.current_workspace())) with check (workspace_id = (select public.current_workspace()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (workspace_id = (select public.current_workspace()))', t || '_delete', t);
    execute format('create index %I on public.%I (workspace_id)', t || '_workspace', t);
  end loop;
end $$;

-- The simple references that did not include the owner. They become workspace-scoped below.
alter table public.activities drop constraint activities_contact_id_fkey;
alter table public.activities drop constraint activities_deal_id_fkey;
alter table public.signals drop constraint signals_run_id_fkey;

-- Targets for the composite foreign keys.
alter table public.companies add constraint companies_id_workspace_key unique (id, workspace_id);
alter table public.contacts add constraint contacts_id_workspace_key unique (id, workspace_id);
alter table public.deals add constraint deals_id_workspace_key unique (id, workspace_id);
alter table public.actions add constraint actions_id_workspace_key unique (id, workspace_id);
alter table public.runs add constraint runs_id_workspace_key unique (id, workspace_id);

alter table public.contacts add foreign key (company_id, workspace_id) references public.companies (id, workspace_id) on delete cascade;
alter table public.deals add foreign key (company_id, workspace_id) references public.companies (id, workspace_id) on delete cascade;
alter table public.deal_contacts add foreign key (deal_id, workspace_id) references public.deals (id, workspace_id) on delete cascade;
alter table public.deal_contacts add foreign key (contact_id, workspace_id) references public.contacts (id, workspace_id) on delete cascade;
alter table public.activities add foreign key (company_id, workspace_id) references public.companies (id, workspace_id) on delete cascade;
alter table public.activities add foreign key (contact_id, workspace_id) references public.contacts (id, workspace_id) on delete set null (contact_id);
alter table public.activities add foreign key (deal_id, workspace_id) references public.deals (id, workspace_id) on delete set null (deal_id);
alter table public.runs add foreign key (action_id, workspace_id) references public.actions (id, workspace_id) on delete cascade;
alter table public.signals add foreign key (company_id, workspace_id) references public.companies (id, workspace_id) on delete cascade;
alter table public.signals add foreign key (run_id, workspace_id) references public.runs (id, workspace_id) on delete set null (run_id);
alter table public.signal_baselines add foreign key (company_id, workspace_id) references public.companies (id, workspace_id) on delete cascade;
alter table public.score_history add foreign key (company_id, workspace_id) references public.companies (id, workspace_id) on delete cascade;
alter table public.budget_reservations add foreign key (action_id, workspace_id) references public.actions (id, workspace_id) on delete cascade;

-- Unique keys move from the owner to the workspace.
alter table public.companies drop constraint companies_owner_id_domain_key, add constraint companies_workspace_domain_key unique (workspace_id, domain);
alter table public.actions drop constraint actions_owner_id_action_key_key, add constraint actions_workspace_action_key_key unique (workspace_id, action_key);
alter table public.runs drop constraint runs_owner_id_idempotency_key_key, add constraint runs_workspace_idempotency_key_key unique (workspace_id, idempotency_key);
alter table public.signals drop constraint signals_owner_id_company_id_kind_dedupe_key_key, add constraint signals_workspace_dedupe_key unique (workspace_id, company_id, kind, dedupe_key);
alter table public.signal_baselines drop constraint signal_baselines_owner_id_company_id_kind_key_key, add constraint signal_baselines_workspace_key unique (workspace_id, company_id, kind, key);
alter table public.budget_reservations drop constraint budget_reservations_owner_id_idempotency_key_key, add constraint budget_reservations_workspace_key unique (workspace_id, idempotency_key);
-- One settings row per workspace. With one workspace per existing user there is nothing to merge.
alter table public.settings drop constraint settings_owner_id_key, add constraint settings_workspace_key unique (workspace_id);
drop index public.contacts_owner_linkedin;
create unique index contacts_workspace_linkedin on public.contacts (workspace_id, linkedin_url) where linkedin_url is not null;

-- Indexes the queries use, now by workspace.
drop index public.contacts_owner_company;
drop index public.deals_owner_stage;
drop index public.activities_owner_company;
drop index public.activities_open_tasks;
drop index public.actions_owner_created;
drop index public.runs_owner_target;
drop index public.signals_owner_unread;
drop index public.score_history_owner_company;
drop index public.budget_reservations_owner_state;
create index contacts_workspace_company on public.contacts (workspace_id, company_id);
create index deals_workspace_stage on public.deals (workspace_id, stage, position);
create index activities_workspace_company on public.activities (workspace_id, company_id, created_at desc);
create index activities_open_tasks on public.activities (workspace_id, due_at) where kind = 'task' and done_at is null;
create index actions_workspace_created on public.actions (workspace_id, created_at desc);
create index runs_workspace_target on public.runs (workspace_id, target_id, created_at desc);
create index signals_workspace_unread on public.signals (workspace_id, read_at, occurred_at desc);
create index score_history_workspace_company on public.score_history (workspace_id, company_id, at);
create index budget_reservations_workspace_state on public.budget_reservations (workspace_id, state);

-- The workspace and member tables. Members read their own workspace. Changes go through the
-- functions below, never through a direct insert, update or delete.
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;
create policy workspaces_select on public.workspaces for select to authenticated using (id = (select public.current_workspace()));
create policy workspaces_update on public.workspaces for update to authenticated using (id = (select public.current_workspace()) and (select public.workspace_role()) = 'owner') with check (id = (select public.current_workspace()));
create policy workspace_members_select on public.workspace_members for select to authenticated using (workspace_id = (select public.current_workspace()));
revoke all on public.workspaces from anon, authenticated;
revoke all on public.workspace_members from anon, authenticated;
grant select on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;

-- The signed-in user's workspace, created or claimed on first use. Returns { workspace_id, role, name }.
-- An invitation for the user's confirmed email is claimed first. With none, a new workspace is
-- created with the user as its owner.
create function public.join_workspace() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_ws uuid;
  v_member public.workspace_members;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  -- Two first requests of the same user must not create two workspaces.
  perform pg_advisory_xact_lock(hashtext('join_workspace:' || v_uid::text));
  select m.* into v_member from public.workspace_members m where m.user_id = v_uid;
  if not found then
    select lower(u.email), u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;
    if v_email is null or v_confirmed is null then
      raise exception 'confirm your email first' using errcode = '42501';
    end if;
    update public.workspace_members m set user_id = v_uid, joined_at = now()
      where m.email = v_email and m.user_id is null
      returning m.* into v_member;
    if not found then
      insert into public.workspaces (created_by) values (v_uid) returning id into v_ws;
      insert into public.workspace_members (workspace_id, email, user_id, role, joined_at)
        values (v_ws, v_email, v_uid, 'owner', now())
        returning * into v_member;
    end if;
  end if;
  return jsonb_build_object(
    'workspace_id', v_member.workspace_id,
    'role', v_member.role,
    'name', (select w.name from public.workspaces w where w.id = v_member.workspace_id)
  );
end;
$$;

-- The owner invites an email into the workspace. Returns { ok } or { ok: false, reason }:
--   invalid: not an email. already: already in this workspace.
--   has_workspace: the person already works in another workspace that has data or other members.
-- A person whose own workspace is empty (no companies, contacts, deals or paid actions, no other
-- member) is moved: that empty workspace is deleted and the invitation takes its place.
create function public.invite_member(p_email text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
  v_role text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_other public.workspace_members;
begin
  select m.workspace_id, m.role into v_ws, v_role from public.workspace_members m where m.user_id = auth.uid();
  if v_ws is null or v_role <> 'owner' then
    raise exception 'only the workspace owner can invite' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select m.* into v_other from public.workspace_members m where m.email = v_email for update;
  if found then
    if v_other.workspace_id = v_ws then
      return jsonb_build_object('ok', false, 'reason', 'already');
    end if;
    if exists (select 1 from public.workspace_members m where m.workspace_id = v_other.workspace_id and m.id <> v_other.id)
       or exists (select 1 from public.companies x where x.workspace_id = v_other.workspace_id)
       or exists (select 1 from public.contacts x where x.workspace_id = v_other.workspace_id)
       or exists (select 1 from public.deals x where x.workspace_id = v_other.workspace_id)
       or exists (select 1 from public.actions x where x.workspace_id = v_other.workspace_id) then
      return jsonb_build_object('ok', false, 'reason', 'has_workspace');
    end if;
    delete from public.workspaces w where w.id = v_other.workspace_id;
  end if;
  insert into public.workspace_members (workspace_id, email, role, invited_by) values (v_ws, v_email, 'member', auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;

-- The owner removes a member or cancels an invitation. The owner cannot remove themselves. The rows
-- the member created stay in the workspace. If they sign in again they get a new, empty workspace.
create function public.remove_member(p_email text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
  v_role text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_n int;
begin
  select m.workspace_id, m.role into v_ws, v_role from public.workspace_members m where m.user_id = auth.uid();
  if v_ws is null or v_role <> 'owner' then
    raise exception 'only the workspace owner can remove members' using errcode = '42501';
  end if;
  if exists (select 1 from public.workspace_members m where m.workspace_id = v_ws and m.email = v_email and m.user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  delete from public.workspace_members m where m.workspace_id = v_ws and m.email = v_email;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0, 'reason', case when v_n > 0 then null else 'not_found' end);
end;
$$;

-- Only the owner sets or changes the daily and monthly budget. A member can still save the other
-- settings. Superusers and the service role (no auth.uid()) are not limited.
create function public.settings_budget_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(public.workspace_role(), '') = 'owner' then
    return new;
  end if;
  if tg_op = 'INSERT' and (new.daily_budget_usd <> 5 or new.monthly_budget_usd <> 50) then
    raise exception 'only the workspace owner can change the budget' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.daily_budget_usd is distinct from old.daily_budget_usd or new.monthly_budget_usd is distinct from old.monthly_budget_usd) then
    raise exception 'only the workspace owner can change the budget' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger settings_budget_guard before insert or update on public.settings for each row execute function public.settings_budget_guard();

-- The budget functions, now per workspace. Same rule and the same row lock as 20261011000000, on the
-- workspace's settings row. They still run with the caller's rights, so row level security stops a
-- user from reserving against another workspace.
drop function public.reserve_budget(uuid, uuid, text, text, numeric, timestamptz, timestamptz, timestamptz, int, int);
drop function public.budget_status(uuid, timestamptz, timestamptz);
drop function public.settle_reservation(uuid, text, timestamptz);
drop function public.release_reservation(uuid, text, timestamptz);
drop function public.hold_reservation(uuid, text, text);

create function public.reserve_budget(
  p_workspace uuid,
  p_action uuid,
  p_key text,
  p_job text,
  p_amount numeric,
  p_now timestamptz,
  p_day_start timestamptz,
  p_month_start timestamptz,
  p_soft_seconds int,
  p_hard_seconds int
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_daily numeric;
  v_monthly numeric;
  v_spent_day numeric;
  v_spent_month numeric;
  v_reserved numeric;
  v_numbers jsonb;
begin
  insert into public.settings (workspace_id) values (p_workspace) on conflict (workspace_id) do nothing;
  -- The row lock is the whole point: every reservation for this workspace waits here, one at a time.
  select s.daily_budget_usd, s.monthly_budget_usd into v_daily, v_monthly
    from public.settings s where s.workspace_id = p_workspace for update;
  if v_daily is null then
    raise exception 'no settings row for workspace %', p_workspace using errcode = '42501';
  end if;
  if not exists (select 1 from public.actions a where a.id = p_action and a.workspace_id = p_workspace) then
    raise exception 'action % does not belong to workspace %', p_action, p_workspace using errcode = '42501';
  end if;

  select coalesce(sum(r.cost_usd), 0) into v_spent_day from public.runs r where r.workspace_id = p_workspace and r.created_at >= p_day_start;
  select coalesce(sum(r.cost_usd), 0) into v_spent_month from public.runs r where r.workspace_id = p_workspace and r.created_at >= p_month_start;
  select coalesce(sum(b.amount_usd), 0) into v_reserved from public.budget_reservations b where b.workspace_id = p_workspace and b.state = 'reserved';

  v_numbers := jsonb_build_object(
    'daily', jsonb_build_object('budget', v_daily, 'spent', v_spent_day, 'reserved', v_reserved),
    'monthly', jsonb_build_object('budget', v_monthly, 'spent', v_spent_month, 'reserved', v_reserved)
  );

  if exists (select 1 from public.budget_reservations b where b.workspace_id = p_workspace and b.idempotency_key = p_key) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate') || v_numbers;
  end if;
  if v_spent_day + v_reserved + p_amount > v_daily then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'scope', 'daily') || v_numbers;
  end if;
  if v_spent_month + v_reserved + p_amount > v_monthly then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'scope', 'monthly') || v_numbers;
  end if;

  insert into public.budget_reservations (workspace_id, action_id, idempotency_key, job_id, amount_usd, created_at, expires_at, hard_expires_at)
  values (p_workspace, p_action, p_key, p_job, p_amount, p_now, p_now + make_interval(secs => p_soft_seconds), p_now + make_interval(secs => p_hard_seconds));
  return jsonb_build_object('ok', true) || v_numbers;
end;
$$;

create function public.budget_status(p_workspace uuid, p_day_start timestamptz, p_month_start timestamptz) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'daily', jsonb_build_object(
      'budget', coalesce(s.daily_budget_usd, 5),
      'spent', (select coalesce(sum(r.cost_usd), 0) from public.runs r where r.workspace_id = p_workspace and r.created_at >= p_day_start),
      'reserved', (select coalesce(sum(b.amount_usd), 0) from public.budget_reservations b where b.workspace_id = p_workspace and b.state = 'reserved')),
    'monthly', jsonb_build_object(
      'budget', coalesce(s.monthly_budget_usd, 50),
      'spent', (select coalesce(sum(r.cost_usd), 0) from public.runs r where r.workspace_id = p_workspace and r.created_at >= p_month_start),
      'reserved', (select coalesce(sum(b.amount_usd), 0) from public.budget_reservations b where b.workspace_id = p_workspace and b.state = 'reserved')))
  from (select 1) one left join public.settings s on s.workspace_id = p_workspace;
$$;

create function public.settle_reservation(p_workspace uuid, p_key text, p_now timestamptz) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set state = 'settled', settled_at = p_now where workspace_id = p_workspace and idempotency_key = p_key and state = 'reserved';
$$;

create function public.release_reservation(p_workspace uuid, p_key text, p_now timestamptz) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set state = 'released', settled_at = p_now where workspace_id = p_workspace and idempotency_key = p_key and state = 'reserved';
$$;

create function public.hold_reservation(p_workspace uuid, p_key text, p_looot_run_id text) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set looot_run_id = p_looot_run_id where workspace_id = p_workspace and idempotency_key = p_key and state = 'reserved';
$$;

grant execute on function public.current_workspace() to authenticated;
grant execute on function public.workspace_role() to authenticated;
grant execute on function public.join_workspace() to authenticated;
grant execute on function public.invite_member(text) to authenticated;
grant execute on function public.remove_member(text) to authenticated;
grant execute on function public.reserve_budget(uuid, uuid, text, text, numeric, timestamptz, timestamptz, timestamptz, int, int) to authenticated;
grant execute on function public.budget_status(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.settle_reservation(uuid, text, timestamptz) to authenticated;
grant execute on function public.release_reservation(uuid, text, timestamptz) to authenticated;
grant execute on function public.hold_reservation(uuid, text, text) to authenticated;

-- Postgres lets every role run a new function unless this is revoked. Only signed-in users may.
revoke execute on function public.current_workspace() from public, anon;
revoke execute on function public.workspace_role() from public, anon;
revoke execute on function public.join_workspace() from public, anon;
revoke execute on function public.invite_member(text) from public, anon;
revoke execute on function public.remove_member(text) from public, anon;
revoke execute on function public.settings_budget_guard() from public, anon;
revoke execute on function public.reserve_budget(uuid, uuid, text, text, numeric, timestamptz, timestamptz, timestamptz, int, int) from public, anon;
revoke execute on function public.budget_status(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.settle_reservation(uuid, text, timestamptz) from public, anon;
revoke execute on function public.release_reservation(uuid, text, timestamptz) from public, anon;
revoke execute on function public.hold_reservation(uuid, text, text) from public, anon;
