-- Data written by 0.1.5, before team workspaces. Run by scripts/test-rls.sh before the team migration.
grant usage on schema public to authenticated;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into companies (id, name, domain) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Upgrade Co', 'upgrade.example');
insert into contacts (company_id, first_name) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Kept');
insert into deals (company_id, name) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Kept deal');
insert into settings (daily_budget_usd, monthly_budget_usd) values (3, 30);
insert into actions (id, action_key, kind, max_cost_usd) values ('bbbbbbbb-0000-0000-0000-000000000002', 'u1', 'intent_refresh', 1);
insert into runs (action_id, job_id, idempotency_key, cost_usd) values ('bbbbbbbb-0000-0000-0000-000000000002', 'news.search', 'crm:u1:news', 0.01);
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into companies (name, domain) values ('Upgrade Co', 'upgrade.example');
reset role;
