-- Stand-in for the Supabase auth schema, so the migration can run on a plain local Postgres.
-- Used only by scripts/test-rls.sh. Never apply this to a Supabase project.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
