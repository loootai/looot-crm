-- Period budget with atomic reservation. Additive: two columns on settings, one new table, five functions.
-- Nothing is dropped or rewritten, so it is safe to apply over 20261009000000_init.sql with data in it.
--
-- The owner sets a daily and a monthly budget for the whole workspace. Before a paid looot call the
-- runner reserves the most that call can cost with reserve_budget(). The function locks the owner's
-- settings row, adds spent + reserved + the new amount and writes the reservation in the same
-- transaction, so two simultaneous actions cannot both pass. The budgets are read from the settings
-- row here, never from the request.

alter table public.settings
  add column daily_budget_usd numeric(10,6) not null default 5 check (daily_budget_usd >= 0),
  add column monthly_budget_usd numeric(10,6) not null default 50 check (monthly_budget_usd >= 0);

-- One row per paid call that was reserved. state: reserved (counts against the budget), settled (the
-- run row holds the real cost), released (the call failed or was refused, nothing was spent).
create table public.budget_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  action_id uuid not null,
  -- Same key the looot call uses. A second reservation for it is refused, so a pending call is never repeated.
  idempotency_key text not null,
  job_id text not null,
  amount_usd numeric(10,6) not null check (amount_usd >= 0),
  state text not null default 'reserved' check (state in ('reserved', 'settled', 'released')),
  looot_run_id text,
  -- After this the reservation is checked against the run's real status (GET /v1/runs/{id}).
  expires_at timestamptz not null,
  -- After this a reservation that could not be resolved is released.
  hard_expires_at timestamptz not null,
  settled_at timestamptz,
  unique (owner_id, idempotency_key),
  foreign key (action_id, owner_id) references public.actions (id, owner_id) on delete cascade
);
create index budget_reservations_owner_state on public.budget_reservations (owner_id, state);
create index budget_reservations_action on public.budget_reservations (action_id);

alter table public.budget_reservations enable row level security;
alter table public.budget_reservations force row level security;
create policy budget_reservations_select on public.budget_reservations for select to authenticated using (owner_id = (select auth.uid()));
create policy budget_reservations_insert on public.budget_reservations for insert to authenticated with check (owner_id = (select auth.uid()));
create policy budget_reservations_update on public.budget_reservations for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy budget_reservations_delete on public.budget_reservations for delete to authenticated using (owner_id = (select auth.uid()));
create index budget_reservations_owner on public.budget_reservations (owner_id);
revoke all on public.budget_reservations from anon;
grant select, insert, update, delete on public.budget_reservations to authenticated;

-- Reserves one paid call. Returns jsonb:
--   { ok: true, daily: {budget, spent, reserved}, monthly: {...} }
--   { ok: false, reason: 'duplicate' | 'budget', scope: 'daily' | 'monthly', daily, monthly }
-- daily and monthly carry the numbers as they were before this call. Runs with the caller's rights,
-- so row level security stops a user from reserving against another owner.
create function public.reserve_budget(
  p_owner uuid,
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
  insert into public.settings (owner_id) values (p_owner) on conflict (owner_id) do nothing;
  -- The row lock is the whole point: every reservation for this owner waits here, one at a time.
  select s.daily_budget_usd, s.monthly_budget_usd into v_daily, v_monthly
    from public.settings s where s.owner_id = p_owner for update;
  if v_daily is null then
    raise exception 'no settings row for owner %', p_owner using errcode = '42501';
  end if;
  if not exists (select 1 from public.actions a where a.id = p_action and a.owner_id = p_owner) then
    raise exception 'action % does not belong to owner %', p_action, p_owner using errcode = '42501';
  end if;

  select coalesce(sum(r.cost_usd), 0) into v_spent_day from public.runs r where r.owner_id = p_owner and r.created_at >= p_day_start;
  select coalesce(sum(r.cost_usd), 0) into v_spent_month from public.runs r where r.owner_id = p_owner and r.created_at >= p_month_start;
  select coalesce(sum(b.amount_usd), 0) into v_reserved from public.budget_reservations b where b.owner_id = p_owner and b.state = 'reserved';

  v_numbers := jsonb_build_object(
    'daily', jsonb_build_object('budget', v_daily, 'spent', v_spent_day, 'reserved', v_reserved),
    'monthly', jsonb_build_object('budget', v_monthly, 'spent', v_spent_month, 'reserved', v_reserved)
  );

  if exists (select 1 from public.budget_reservations b where b.owner_id = p_owner and b.idempotency_key = p_key) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate') || v_numbers;
  end if;
  if v_spent_day + v_reserved + p_amount > v_daily then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'scope', 'daily') || v_numbers;
  end if;
  if v_spent_month + v_reserved + p_amount > v_monthly then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'scope', 'monthly') || v_numbers;
  end if;

  insert into public.budget_reservations (owner_id, action_id, idempotency_key, job_id, amount_usd, created_at, expires_at, hard_expires_at)
  values (p_owner, p_action, p_key, p_job, p_amount, p_now, p_now + make_interval(secs => p_soft_seconds), p_now + make_interval(secs => p_hard_seconds));
  return jsonb_build_object('ok', true) || v_numbers;
end;
$$;

-- Used, held and the budgets for today and this month. Reads only.
create function public.budget_status(p_owner uuid, p_day_start timestamptz, p_month_start timestamptz) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'daily', jsonb_build_object(
      'budget', coalesce(s.daily_budget_usd, 5),
      'spent', (select coalesce(sum(r.cost_usd), 0) from public.runs r where r.owner_id = p_owner and r.created_at >= p_day_start),
      'reserved', (select coalesce(sum(b.amount_usd), 0) from public.budget_reservations b where b.owner_id = p_owner and b.state = 'reserved')),
    'monthly', jsonb_build_object(
      'budget', coalesce(s.monthly_budget_usd, 50),
      'spent', (select coalesce(sum(r.cost_usd), 0) from public.runs r where r.owner_id = p_owner and r.created_at >= p_month_start),
      'reserved', (select coalesce(sum(b.amount_usd), 0) from public.budget_reservations b where b.owner_id = p_owner and b.state = 'reserved')))
  from (select 1) one left join public.settings s on s.owner_id = p_owner;
$$;

-- The run row now holds the real cost. The reservation stops counting.
create function public.settle_reservation(p_owner uuid, p_key text, p_now timestamptz) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set state = 'settled', settled_at = p_now where owner_id = p_owner and idempotency_key = p_key and state = 'reserved';
$$;

-- The call failed or was refused, nothing was spent. Only a reserved row can be released.
create function public.release_reservation(p_owner uuid, p_key text, p_now timestamptz) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set state = 'released', settled_at = p_now where owner_id = p_owner and idempotency_key = p_key and state = 'reserved';
$$;

-- The call is accepted but not finished. Keep the looot run id so a later check can read its status.
create function public.hold_reservation(p_owner uuid, p_key text, p_looot_run_id text) returns void
language sql
set search_path = ''
as $$
  update public.budget_reservations set looot_run_id = p_looot_run_id where owner_id = p_owner and idempotency_key = p_key and state = 'reserved';
$$;

grant execute on function public.reserve_budget(uuid, uuid, text, text, numeric, timestamptz, timestamptz, timestamptz, int, int) to authenticated;
grant execute on function public.budget_status(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.settle_reservation(uuid, text, timestamptz) to authenticated;
grant execute on function public.release_reservation(uuid, text, timestamptz) to authenticated;
grant execute on function public.hold_reservation(uuid, text, text) to authenticated;

-- Postgres lets every role run a new function unless this is revoked. Only signed-in users may.
revoke execute on function public.reserve_budget(uuid, uuid, text, text, numeric, timestamptz, timestamptz, timestamptz, int, int) from public, anon;
revoke execute on function public.budget_status(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.settle_reservation(uuid, text, timestamptz) from public, anon;
revoke execute on function public.release_reservation(uuid, text, timestamptz) from public, anon;
revoke execute on function public.hold_reservation(uuid, text, text) from public, anon;
