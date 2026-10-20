# Changelog

Built from the GitHub release notes. Each version links to its release page.

## Unreleased

MCP. Claude and other MCP clients can read and update the CRM as the signed-in person. See [MCP](README.md#mcp).

- `/mcp`: a stateless Streamable HTTP MCP endpoint with eleven tools. Five read (search, a company, a person, the pipelines, the cards on a pipeline). Six write (move a card, add a note, set a next step, add a person, a company or a card). None deletes, changes the team, the budget or settings, or spends.
- Sign-in through the Supabase Auth OAuth 2.1 server: `/.well-known/oauth-protected-resource` points clients at it, and `/oauth/consent` is the consent page. It only approves apps that redirect to a host on `MCP_ALLOWED_REDIRECT_HOSTS` (default Claude and localhost).
- Every call rechecks the allow-list and runs with row level security as the person. Every write records an activity tagged `via: "mcp"`.
- The writes the app and the tools share moved from the server actions to `src/lib/records.ts`, so both write the same rows and history.
- Signing in keeps where you were going: the sign-in page and the callback bring you back to the page you asked for, such as the consent page.

Setup: in the Supabase dashboard, Authentication, OAuth Server, turn on the server, allow dynamic client registration and set the authorization path to `/oauth/consent`.

Pipelines. A workspace can run several boards, each with its own stages, for example sales, partnerships, sponsors or applicants.

- New tables `pipelines` and `pipeline_stages`. A stage has a stable key, a label and a kind: open, won or lost. `deals.pipeline_id` is required, and `(pipeline_id, stage)` is a foreign key to the stage, so a deal can only sit in a stage of its own pipeline and a stage with deals cannot be deleted.
- A pipeline is about companies or people. `deals.contact_id` holds the person for a pipeline of people, and `deals.company_id` is optional; a deal needs one of the two.
- A pipeline carries an amount in its own currency, or none. Today counts money in the first pipeline that tracks an amount. Amounts in different currencies are never added together.
- Settings, Pipelines: templates (Sales, Partnerships, Sponsors, Applicants), rename, add, reorder and remove stages, change the currency, reorder or delete pipelines. The board has a pipeline switcher, and the deal sheet shows the pipeline's own stages and closing buttons.
- Stage changes save the stage labels in the timeline, so renaming a stage later does not rewrite history.
- Money is formatted in the pipeline's currency, not always USD.
- The demo has a second board, Partnerships, with three deals.

Migration: apply `supabase/migrations/20261016100000_pipelines.sql` after the team migration. Every workspace with deals gets a Sales pipeline with the six 0.1.x stages and its deals move into it unchanged. A deal inserted without a pipeline goes to the first one.

Team workspaces. A small team now works in one workspace: the same companies, people, deals, signals and budget.

- New tables `workspaces` and `workspace_members`. Every data table gets `workspace_id`, and row level security compares it with `current_workspace()` instead of comparing `owner_id` with the user.
- The first sign-in of someone with no invitation creates their own workspace, so a team of one works as before. The owner invites by email in Settings, Team; the invitation is claimed when that email signs in with a confirmed address. The allow-list still decides who can use the app at all.
- Only the owner invites, removes, renames, changes the daily and monthly budget and deletes all workspace data. The budget rule is also a database trigger.
- Composite foreign keys now pair every reference with `workspace_id`. The activity links to a contact or deal, and a signal's link to its run, are workspace-scoped too; before, they were plain references.
- `owner_id` means "created by" and is set to null when that user is deleted, so a member leaving no longer deletes the team's rows.
- The budget functions take the workspace id. Budgets and spend are per workspace.
- `npm run test:rls` covers 14 tables, the team rules and an upgrade from 0.1.5 data.

Migration: apply `supabase/migrations/20261016000000_team_workspaces.sql` and deploy this version at the same time. Every existing user gets a workspace of their own as its owner and their rows move into it, so nothing is shared until an owner invites someone.

## 0.1.5 (2026-10-11)

Spend limits across actions. Before this version nothing in the database limited what one workspace spent in a day or a month. Each action was capped, but the only limits across actions were an in-memory rate limit (per server instance) and the balance on your looot token.

- New daily and monthly budget for the whole workspace (`settings.daily_budget_usd`, default $5, and `settings.monthly_budget_usd`, default $50). Only the owner changes them, in Settings. A run request cannot, and budget fields in a request are ignored.
- Atomic reservation. Before each paid call the app quotes the price, applies the per-action max and the per-run cap, then calls `reserve_budget`, which locks the owner's settings row and reserves the call's cap if spent + reserved + amount fits both budgets. Two actions that start together cannot both pass.
- A completed call settles to its real cost. A failed call, or one looot refused, releases the reservation. A pending call keeps it, is not written as failed at $0 and does not give budget back early.
- Reservations older than 15 minutes are reconciled against `GET /v1/runs/{id}` when an action next starts. A run that is still pending, or cannot be fetched, stays reserved for 24 hours, then it is released.
- The sidebar spend panel and the Spend page show used, held and left for today and the month. When a budget is reached the action stops with a message that names the period and the numbers.
- The per-run cap and the per-action max are unchanged.

Migration: apply `supabase/migrations/20261011000000_period_budget.sql` before you deploy. It adds two columns and a table and drops nothing. Without it paid actions fail before any call. The README setup step lists both migration files.

Upgrade note: the looot token balance is still the final limit. Use a dedicated token and fund it with what you are willing to spend.

## 0.1.4 (2026-10-11)

Security fix. Versions before 0.1.4 let any signed-in Supabase user use the workspace. If your Supabase project allows open sign-ups (the default for a new project), a stranger could create an account, read your data, change settings and spend your `LOOOT_TOKEN`.

If you run looot CRM on a reachable host, upgrade and set the allow-list.

What changed
- New `LOOOT_CRM_ALLOWED_EMAILS` (comma separated, case-insensitive, exact match) and optional `LOOOT_CRM_ALLOWED_DOMAINS`. The server checks them in the proxy, every route handler and every server action. The email must be confirmed.
- Upgrade note: outside demo mode, with neither variable set, the app is closed. Signed-in users see a setup page and the APIs answer 503. A user not on the list sees "not authorised for this workspace" and the APIs answer 403.
- Per-user rate limit on `/api/quote` and `/api/actions` (`SPEND_RATE_LIMIT_PER_MIN`, default 30). The spend cap comes from server limits and Settings; a caller can only lower it.
- The sign-in callback accepts `next` only as a same-origin relative path.
- Also turn off public sign-ups in your Supabase project. See "Securing a deployment" in the README.

[Release page](https://github.com/loootai/looot-crm/releases/tag/v0.1.4)

## 0.1.3 (2026-10-10)

Sidebar: nested-item support in the shared shell

[Release page](https://github.com/loootai/looot-crm/releases/tag/v0.1.3)

## 0.1.2 (2026-10-10)

Sidebar layout.

[Release page](https://github.com/loootai/looot-crm/releases/tag/v0.1.2)

## 0.1.1 (2026-10-09)

Fixes from an independent review of v0.1.0.

Money
- A run that has not ended (still running when polling stops, or a request with no answer) keeps its cap held out of the max you confirmed. Before, the next steps were given the whole remaining max, so a late charge could put the action above it.
- Caps and maxes print exactly. The $0.005 page-read cap was shown as $0.01.

Keyboard and focus
- Left and right arrows move a picked-up card to the next stage. Before, a card could not change stage from the keyboard.
- Cards can be dropped on the collapsed Won and Lost rails.
- Dialogs and sheets give focus back to the button that opened them.

Data shown
- Moving a deal in demo mode wrote "Moved from Qualified to Qualified". The demo store now returns copies, as Postgres does.
- An email looot found on an imported contact is labelled as found by looot, not "from your CSV".
- A step that returned nothing no longer gets a check mark in the quote result.
- A headline with "appointment" in it is no longer tagged as a leadership change.

UI
- The Companies table fits at 1440 px. "Clear filters" also clears the search box.
- The spend chart draws at its real width.
- Find more people closes its quote when done, so the candidates are not hidden behind it.

Dependencies
- next and eslint-config-next 16.3.8, which fixes the advisories open against 16.3.7.

82 tests pass. No paid looot run was made.

[Release page](https://github.com/loootai/looot-crm/releases/tag/v0.1.1)

## 0.1.0 (2026-10-08)

First release of looot CRM.

- Companies, people, deals on a six-stage pipeline board, and an activity timeline.
- An Intent tab per account: hiring, funding, tech stack, news and site changes, with a score from 0 to 100 that is a sum you can check by hand.
- Contact enrichment (work email, verification, phone) and "Find more people like this".
- Every paid action shows a quote first and cannot spend more than the max you confirm. One idempotency key per run.
- Demo mode: `npm ci && npm run demo`, no Supabase project and no looot token.
- Supabase Auth, 11 tables with row level security, tested on a local Postgres.

Checked: typecheck and lint clean, 77 tests pass, build passes, a fake token is absent from `.next/static`, RLS check passes on 11 tables.

Not yet: no real looot run and no hosted Supabase project were used while building this. See "Not yet" in the README.

[Release page](https://github.com/loootai/looot-crm/releases/tag/v0.1.0)
