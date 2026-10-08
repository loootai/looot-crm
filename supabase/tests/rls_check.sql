-- Row level security check for all 11 tables. Run by scripts/test-rls.sh on a throwaway Postgres.
-- User 1 inserts one row in every table. User 2 must see none of them and must not be able to
-- insert for user 1, update or delete them.
grant usage on schema public to authenticated;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into companies (id, name, domain) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Brightwell Logistics', 'brightwell-logistics.example');
insert into contacts (id, company_id, first_name) values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Adaeze');
insert into deals (id, company_id, name) values ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Yard scheduling');
insert into deal_contacts (deal_id, contact_id) values ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002');
insert into activities (company_id, kind, body) values ('aaaaaaaa-0000-0000-0000-000000000001', 'note', 'First call');
insert into actions (id, action_key, kind, max_cost_usd) values ('aaaaaaaa-0000-0000-0000-000000000004', 'k1', 'intent_refresh', 0.13);
insert into runs (id, action_id, job_id, idempotency_key) values ('aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000004', 'news.search', 'crm:k1:news.search:x');
insert into signals (company_id, kind, title, occurred_at, points, dedupe_key) values ('aaaaaaaa-0000-0000-0000-000000000001', 'news', 'Raises a round', now(), 6, 'n1');
insert into signal_baselines (company_id, kind, key) values ('aaaaaaaa-0000-0000-0000-000000000001', 'tech', 'tech');
insert into score_history (company_id, score) values ('aaaaaaaa-0000-0000-0000-000000000001', 40);
insert into settings (role_keywords) values ('{logistics}');

-- The money rule: actual above the confirmed max is refused by the check constraint.
do $$ begin
  update actions set actual_usd = 0.14 where action_key = 'k1';
  raise exception 'OVER MAX UPDATE SUCCEEDED';
exception when check_violation then raise notice 'actual above max refused';
end $$;

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['companies','contacts','deals','deal_contacts','activities','actions','runs','signals','signal_baselines','score_history','settings'] loop
    execute format('select count(*) from public.%I', t) into n;
    raise notice 'user2 sees % rows in %', n, t;
    execute format('with u as (update public.%I set created_at = now() returning 1) select count(*) from u', t) into n;
    raise notice 'user2 updated % rows in %', n, t;
    execute format('with d as (delete from public.%I returning 1) select count(*) from d', t) into n;
    raise notice 'user2 deleted % rows in %', n, t;
  end loop;
end $$;

-- Forged owner_id: refused by the insert policy, on every table.
do $$
declare
  t text;
  stmts text[] := array[
    'insert into companies (owner_id, name, domain) values (''11111111-1111-1111-1111-111111111111'', ''Spoof'', ''spoof.example'')',
    'insert into contacts (owner_id, first_name) values (''11111111-1111-1111-1111-111111111111'', ''Spoof'')',
    'insert into deals (owner_id, company_id, name) values (''11111111-1111-1111-1111-111111111111'', ''aaaaaaaa-0000-0000-0000-000000000001'', ''Spoof'')',
    'insert into deal_contacts (owner_id, deal_id, contact_id) values (''11111111-1111-1111-1111-111111111111'', ''aaaaaaaa-0000-0000-0000-000000000003'', ''aaaaaaaa-0000-0000-0000-000000000002'')',
    'insert into activities (owner_id, kind) values (''11111111-1111-1111-1111-111111111111'', ''note'')',
    'insert into actions (owner_id, action_key, kind, max_cost_usd) values (''11111111-1111-1111-1111-111111111111'', ''k2'', ''intent_refresh'', 1)',
    'insert into runs (owner_id, action_id, job_id, idempotency_key) values (''11111111-1111-1111-1111-111111111111'', ''aaaaaaaa-0000-0000-0000-000000000004'', ''news.search'', ''k'')',
    'insert into signals (owner_id, company_id, kind, title, occurred_at, points, dedupe_key) values (''11111111-1111-1111-1111-111111111111'', ''aaaaaaaa-0000-0000-0000-000000000001'', ''news'', ''x'', now(), 1, ''z'')',
    'insert into signal_baselines (owner_id, company_id, kind, key) values (''11111111-1111-1111-1111-111111111111'', ''aaaaaaaa-0000-0000-0000-000000000001'', ''site'', ''u'')',
    'insert into score_history (owner_id, company_id, score) values (''11111111-1111-1111-1111-111111111111'', ''aaaaaaaa-0000-0000-0000-000000000001'', 1)',
    'insert into settings (owner_id) values (''11111111-1111-1111-1111-111111111111'')'
  ];
begin
  foreach t in array stmts loop
    begin
      execute t;
      raise exception 'SPOOF INSERT SUCCEEDED: %', t;
    exception when insufficient_privilege then
      raise notice 'forged owner refused: %', split_part(t, ' ', 3);
    end;
  end loop;
end $$;

-- A row of user 2 that points at a company of user 1 is refused by the composite foreign key.
do $$ begin
  insert into signals (company_id, kind, title, occurred_at, points, dedupe_key) values ('aaaaaaaa-0000-0000-0000-000000000001', 'news', 'x', now(), 1, 'cross');
  raise exception 'CROSS-OWNER INSERT SUCCEEDED';
exception when foreign_key_violation then raise notice 'cross-owner reference refused';
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['companies','contacts','deals','deal_contacts','activities','actions','runs','signals','signal_baselines','score_history','settings'] loop
    execute format('select count(*) from public.%I', t) into n;
    raise notice 'user1 sees % rows in %', n, t;
  end loop;
end $$;

-- anon reads nothing.
reset role;
set role anon;
do $$ begin
  perform count(*) from public.companies;
  raise exception 'ANON READ SUCCEEDED';
exception when insufficient_privilege then raise notice 'anon refused';
end $$;
reset role;
select 'tables without rls|' || count(*) from pg_tables where schemaname = 'public' and not rowsecurity;
select 'tables without forced rls|' || count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relforcerowsecurity;
select 'public tables|' || count(*) from pg_tables where schemaname = 'public';
