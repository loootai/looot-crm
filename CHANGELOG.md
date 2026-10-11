# Changelog

Built from the GitHub release notes. Each version links to its release page.

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
