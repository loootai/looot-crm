<p align="center"><img src="assets/hero.png" alt="looot-crm: an account page with an intent score and five signals, and a pipeline board" width="100%"></p>

# looot CRM

[![License](https://img.shields.io/github/license/loootai/looot-crm)](LICENSE) [![Release](https://img.shields.io/github/v/release/loootai/looot-crm)](https://github.com/loootai/looot-crm/releases) [![Docs](https://img.shields.io/badge/docs-docs.looot.ai-12A06A)](https://docs.looot.ai)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-crm&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,LOOOT_TOKEN&envDescription=Supabase%20project%20URL%20and%20anon%20key%2C%20plus%20a%20looot%20agent%20token&envLink=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-crm%23set-up&project-name=looot-crm&repository-name=looot-crm)

An open-source CRM for a sales team of one to five people, with buying signals built in. It has companies, people, deals on a pipeline board and an activity timeline. Each account also has an Intent tab with five public signals (hiring, funding, tech stack, news, site changes) and a score from 0 to 100. Every signal is fetched on demand and shows its price before it runs.

It runs on Next.js and Supabase (auth and Postgres), deploys to Vercel, and gets its data from [looot](https://looot.ai): one key and one prepaid balance for 2,500+ data API endpoints. This project is built on looot. It is not the looot dashboard.

## What it replaces

A CRM seat (the Pipedrive, HubSpot Starter, Attio or folk kind) plus a separate enrichment and intent subscription (the Apollo or Common Room kind). In those products the intent data is a second plan or an upgrade, and none shows what one refresh costs. Here there is no data plan. A full refresh of one account is about $0.02 in looot calls, enriching one contact with email, verification and phone is about $0.05, and a failed call costs nothing.

What you give up: no email sequences, no dialer, no custom objects, no reports, no shared team workspace and no scheduled refresh. See [Not yet](#not-yet).

## Run the demo in one command

```bash
git clone https://github.com/loootai/looot-crm && cd looot-crm && npm ci && npm run demo
```

Open http://localhost:3217. Demo mode needs no Supabase project and no looot token. It runs on seeded data for a made-up seller of dock scheduling software: 14 companies, 41 people, 17 deals and 60 signals, with every date stored as an offset from now so it does not go stale. All company names are invented and every domain ends in `.example`. A "Demo data" badge sits in the top bar. Paid actions show the same quote as the real app, then play a simulated run, and the button says "Run (demo, no charge)". Changes last until the server restarts.

The only outside request in demo mode is the free price read from `api.looot.ai`. Set `LOOOT_OFFLINE=1` to skip it and use the saved prices.

In demo mode you can force a state on a list page with `?state=empty` or `?state=error`. `?theme=dark` and `?theme=light` set the theme.

## Screens

| | |
|---|---|
| **Today.** New signals grouped by account with the score change this week, what is due or overdue, and the open pipeline by stage. | ![Today](docs/screenshots/today.png) |
| **Companies.** Sort by score, a 12-week sparkline, the top signal, open deal value, and when intent was last checked. Keys: `j` `k` move, `Enter` opens, `x` selects, `r` refreshes intent. | ![Companies table](docs/screenshots/companies.png) |
| **Company page.** Details on the left with the source and date of each enriched field, then Timeline, Intent, People and Deals tabs. | ![Company page](docs/screenshots/company.png) |
| **Intent tab.** The score, its history, and a table that shows how the five kinds add up to it. Then one section per signal with the looot job, its price and its own Refresh button. | ![Intent tab](docs/screenshots/intent-full.png) |
| **Not checked yet.** A new account shows the price of each check before anything runs. | ![Intent tab, not checked](docs/screenshots/intent-not-checked.png) |
| **A failed check.** The section shows the error, the $0 cost and "Try again". | ![Intent tab with a failed section](docs/screenshots/intent-error.png) |
| **People.** Email status as an icon and a word, phone, last activity, filters and bulk enrich. | ![People table](docs/screenshots/people.png) |
| **Contact drawer.** Each missing field has a Find button with its price. | ![Contact drawer](docs/screenshots/contact.png) |
| **Quote.** Every paid action opens this first. Untick a step, lower the most you will spend, then run. | ![Quote dialog](docs/screenshots/quote.png) |
| **After the run.** What each step returned and what it cost. Here the email was found and verified, and the phone lookup came back empty at $0. A step that returns nothing gets no check mark. | ![Quote dialog after a run](docs/screenshots/quote-done.png) |
| **Find more people like this.** Starts from one contact's title. Nothing is saved until you pick. | ![Find more people](docs/screenshots/find-people.png) |
| **Pipeline.** Six stages with count and value. Cards carry the intent score and the next step, in amber when overdue or missing. Drag with the mouse, or pick a card up with `Space`, change its stage with the left and right arrows and its order with up and down, then `Space` again. Dropping on Won or Lost asks for the reason. | ![Pipeline board](docs/screenshots/pipeline.png) |
| **Deal.** Stage stepper, the two newest signals as "Why now", next step, contacts with roles, timeline. | ![Deal sheet](docs/screenshots/deal.png) |
| **Spend.** Every looot run the app made: job, run id, cost and idempotency key, next to the max you confirmed. | ![Spend](docs/screenshots/spend.png) |
| **Settings.** Role keywords for the hiring match, watched pages, score weights, and your ceiling per action. | ![Settings](docs/screenshots/settings.png) |
| **Command palette.** `Cmd+K` or `/`. `?` lists every shortcut. | ![Command palette](docs/screenshots/palette.png) |
| **Sign in.** Magic link and Google through Supabase Auth. Demo mode skips it. | ![Sign in](docs/screenshots/login.png) |
| **Dark.** | ![Intent tab, dark](docs/screenshots/intent-dark.png) |

At phone width the sidebar becomes a bottom tab bar, tables become lists, and the board shows one stage at a time with a "Move to" menu on each card.

<p>
<img src="docs/screenshots/m-today.png" alt="Today on a phone" width="24%"> <img src="docs/screenshots/m-companies.png" alt="Companies on a phone" width="24%"> <img src="docs/screenshots/m-intent.png" alt="Intent tab on a phone" width="24%"> <img src="docs/screenshots/m-pipeline.png" alt="Pipeline on a phone" width="24%">
</p>
<p>
<img src="docs/screenshots/m-quote.png" alt="Quote on a phone" width="24%"> <img src="docs/screenshots/m-deal.png" alt="Deal on a phone" width="24%"> <img src="docs/screenshots/m-spend.png" alt="Spend on a phone" width="24%"> <img src="docs/screenshots/m-pipeline-dark.png" alt="Pipeline on a phone, dark" width="24%">
</p>

## The score

The score is a sum you can check by hand, not a model.

- Points per signal: a funding round 30, each open role whose title matches your keywords 8, each technology added or removed 10, a news item tagged funding, launch, leadership or partnership 6, other news 2, a changed watched page 5. You can edit these in Settings.
- Caps per kind: funding 30, hiring 24, tech 20, news 16, site 10. They add up to 100.
- Decay: a signal loses half its points every 30 days and counts zero after 90 days.

The Intent tab shows the points per kind and the total. The code is `scoreCompany` in `src/lib/score.ts`.

The first check of tech stack or a watched page saves a baseline and makes no signal, because there is nothing to compare with yet. Changes show from the second check.

## looot jobs and prices

Read from the free catalog (`GET https://api.looot.ai/v1/catalog/overview?depth=jobs`, revision 101880) on 2026-10-08. The quote is the higher of the cheapest price per call and the cheapest price per result times the results one call is expected to return. The cap is sent as `fallback.maxCostUsd`, so looot does not charge one run more than that.

| Feature | looot job | Providers | Cheapest per call | Cheapest per result | Quote | Cap per run |
|---|---|---|---|---|---|---|
| Enrich company | `company.enrich` | 21 | $0.0019 | $0.00145 | $0.0019 | $0.02 |
| Intent: hiring | `jobs.search` | 7 | $0.0005 | $0.000145 | $0.00145 (10 results) | $0.02 |
| Intent: news | `news.search` | 8 | $0.00099 | none | $0.00099 | $0.01 |
| Intent: tech stack | `company.technographics` | 5 | $0 | $0.01 | $0.01 | $0.02 |
| Intent: funding | `company.funding` | 3 | $0.01 | none | $0.01 | $0.07 |
| Intent: site changes | `web.scrape.markdown` | 10 | $0.0002 | $0.001 | $0.001 per page | $0.005 |
| Find work email | `people.email.find` | 17 | $0.003598 | $0.019 | $0.019 | $0.03 |
| Verify email | `people.email.verify` | 13 | $0.00145 | none | $0.00145 | $0.01 |
| Find phone | `people.phone.find` | 12 | $0.00483 | $0.0264 | $0.0264 | $0.06 |
| Find more people | `people.search` | 17 | $0 | $0.00036 | $0.0036 (10 results) | $0.02 |

Totals you can redo by hand:

- Refresh one account with two watched pages: $0.00145 + $0.00099 + $0.01 + $0.01 + 2 x $0.001 = $0.02444 estimated, $0.13 worst case.
- Enrich one contact, all three steps: $0.019 + $0.00145 + $0.0264 = $0.04685 estimated, $0.10 worst case.
- Find 10 more people: $0.0036 estimated, $0.02 worst case.

The app reads live prices from the same free endpoint, caches them for an hour, and falls back to the saved table in `src/lib/jobs.ts` when the catalog cannot be reached. The quote dialog says which one it used. The Spend page prints the table it is using.

The app calls jobs, not pinned endpoints, so looot picks the provider and the response body differs per provider. The readers in `src/lib/extract.ts` are tolerant: they look for the fields each provider documents and treat "nothing found" as no result. They were written from public docs and fixtures. No paid run was made while building this, so the first real run of a job may need a small reader fix.

## How the money rules work

1. Every paid action first calls `POST /api/quote`. It builds the plan on the server and returns one line per step, the estimate, the worst case, and where the prices came from. It spends nothing.
2. You confirm the most you want to spend. `POST /api/actions` rebuilds the plan on the server and never trusts prices from the browser.
3. For each run the cap is the smaller of the job's cap and what is left of your max. If what is left is below the job's quote, the run is skipped and the action ends as "stopped at max". Actual spend cannot pass the max you confirmed. The `actions` table also has a check constraint `actual_usd <= max_cost_usd`.
4. Each run carries an idempotency key, `crm:<actionKey>:<job>:<target>`. A retry or a double click replays the stored run and does not charge again. `runs` has a unique index on it.
5. Steps that would be pointless are not paid for. Verification does not run when no email was found.
6. A failed, blocked or empty run is recorded with its real cost, which is normally $0.
7. A run whose end is unknown keeps its cap held out of your max. That is a run still going when the app stops polling (about a minute), or a request that got no answer. looot may still charge it later, so the steps after it only get what is left. The run row says how much is held.
8. `PER_ACTION_MAX_USD` (default 2) and `BULK_MAX_RECORDS` (default 50) are server limits. Your typed max is clamped to the first, and to the lower ceiling you can set in Settings.

`LOOOT_TOKEN` is read in `src/lib/looot.ts`, `src/lib/api.ts` and the balance route, all of which import `server-only`. There is no `NEXT_PUBLIC_` copy. The build was checked with a fake token: `grep -r` over `.next/static` does not find the value. The variable name does appear there once, inside the error message "LOOOT_TOKEN is not set on the server".

## Set up

You need a Supabase project, a looot agent token, and Node 20 or newer.

1. Create a Supabase project. In Project Settings, API, copy the project URL and the anon key.
2. Apply the schema from a clone of this repo:

   ```bash
   npx supabase@2.118.0 login
   npx supabase@2.118.0 link --project-ref <your-project-ref>
   npx supabase@2.118.0 db push
   ```

   Or paste `supabase/migrations/20261009000000_init.sql` into the SQL editor and run it.
3. In Supabase, Authentication, URL Configuration, add `<your app URL>/auth/callback` as a redirect URL. Turn on the Google provider if you want "Continue with Google".
4. Create a looot agent token at https://looot.ai/settings with `catalog.read`, `runs.read` and `runs.execute`, and top up from $5.
5. Copy `.env.example` to `.env.local`, fill in the values, then:

   ```bash
   npm ci
   npm run dev
   ```

| Variable | Needed | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key |
| `LOOOT_TOKEN` | for paid actions | looot agent token, server only. Without it the CRM works and paid actions say the token is missing |
| `LOOOT_API_URL` | no | Defaults to `https://api.looot.ai` |
| `PER_ACTION_MAX_USD` | no | The most one action may spend. Default 2 |
| `BULK_MAX_RECORDS` | no | The most records one bulk action may touch. Default 50 |
| `NEXT_PUBLIC_DEMO` | no | `1` turns on demo mode |
| `LOOOT_OFFLINE` | no | `1` skips the price read and uses the saved prices |

Start with **Import CSV** on the Companies page. Map the name and domain columns, plus optional contact columns. Import is free, skips duplicate domains, and takes up to 2,000 rows.

## Data model and security

One migration creates 11 tables: `companies`, `contacts`, `deals`, `deal_contacts`, `activities`, `signals`, `signal_baselines`, `score_history`, `actions`, `runs` and `settings`. Every table has `owner_id uuid default auth.uid()`, row level security enabled and forced, and four policies for the `authenticated` role with `owner_id = (select auth.uid())`. The `anon` role can read nothing. The app uses the anon key with the user's session only. There is no service role key.

`npm run test:rls` proves it on a throwaway local Postgres started with `initdb` and `pg_ctl` (no Docker, no Supabase project). A second user sees, updates and deletes zero rows of the first user in all 11 tables, cannot insert a row with a forged owner, and cannot point a row at another owner's company. It also checks that an `actions` row with actual above max is refused. The script prints "SKIPPED" when PostgreSQL is not installed.

## Develop

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run test:rls
npm run build
```

`npm test` runs 82 vitest tests with looot mocked: the score rule with decay and caps, plan and worst case per action, the max-cost guard (including the hold on a run that has not ended), idempotency, each result reader on fixtures, CSV mapping and duplicates, and the demo seed sums. `scripts/screenshots.mjs` retakes the README screenshots from a running demo with headless Chrome. Start the demo fresh first, since demo writes last until the server restarts.

Dependencies are pinned to exact versions and `.npmrc` sets `ignore-scripts=true`. `scripts/leak-scan.sh` runs before each commit once you run `git config core.hooksPath .githooks`.

## Not yet

- No real looot run was made while building this. Prices and job ids come from the live catalog. Result readers come from provider docs and fixtures.
- Not run against a hosted Supabase project. The migration and row level security were tested on local Postgres, and the Supabase code path passes typecheck and build. Sign-in was not clicked through with a real project.
- `people.search` passes `job_title` and `limit` as sent, and only some providers use those names. The app also filters returned people by your title keywords and says how many matched.
- The cheapest `company.technographics` provider returns category counts, not named technologies. The added and removed lists need named technologies. Otherwise the section says the provider returned categories only.
- `company.funding` has three providers and two of them do not key on a domain. If the run fails on input, the section shows the error at $0. Funding news still arrives through `news.search`.
- One workspace per sign-in. A shared team workspace needs a members table and new policies.
- No scheduled refresh. Intent is checked when you click.
- No email sending, no sequences, no dialer, no sync to another CRM. CSV import and export instead.
- No contrast audit tool was run. Colors were picked to pass AA and checked by eye in both themes.
- Some icon buttons are 24 to 28 px at phone width (row actions on Today, the row expander in Spend, keyword chips in Settings). The target is 40 px.
- The spend chart shows a day's split on hover only. There is no keyboard path to it yet. The table under it has the same numbers.
- `npm audit` reports `braces` (a lint-time dependency, no fixed version published). Nothing from it ships in the app.
- Later signal kinds from the catalog: lookalike accounts (`company.similar`), a contact changed jobs (`people.job-change`), a company job board (`jobs.company`).

## License

MIT. See [LICENSE](LICENSE). looot privacy policy: https://looot.ai/privacy. Terms: https://looot.ai/terms. Support: https://looot.ai/contact.
