-- After the team migration: every user owns a workspace, every row moved with its owner, and the
-- budget and spend carried over. Run by scripts/test-rls.sh.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  if (select public.join_workspace() ->> 'role') = 'owner'
     and (select count(*) from companies) = 1 and (select count(*) from contacts) = 1 and (select count(*) from deals) = 1
     and (select daily_budget_usd from settings) = 3
     and (select (public.budget_status(public.current_workspace(), '2000-01-01', '2000-01-01') -> 'daily' ->> 'spent')::numeric) = 0.01
  then raise notice 'upgrade kept user1 rows'; end if;
end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from companies) = 1 and (select count(*) from contacts) = 0 then raise notice 'upgrade kept user2 apart'; end if;
end $$;
reset role;
select 'rows without workspace|' || (select count(*) from companies where workspace_id is null) + (select count(*) from runs where workspace_id is null);
