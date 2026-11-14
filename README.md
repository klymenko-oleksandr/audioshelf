# Audioshelf

A free, web-based audiobook player: browse a curated catalogue, listen with a persistent
player, and pick up on any device where you left off.

This is the v2 rewrite. The v1 app lives on the [`legacy_v1`](../../tree/legacy_v1) branch.

## Stack

Next.js (App Router, TypeScript strict) · Tailwind v4 · Drizzle ORM · Supabase (Postgres) ·
Cloudflare R2 (public bucket behind a CDN domain) · next-intl (Ukrainian + English, no locale in
the URL) · Vitest + Testing Library · Playwright · Vercel.

## Getting started

```bash
nvm use            # Node 22
npm install
cp .env.example .env   # fill in the values — the home page itself needs none
npm run dev
```

## Scripts

| Command                                 | What it does                                             |
| --------------------------------------- | -------------------------------------------------------- |
| `npm run dev` / `build` / `start`       | Next.js dev server / production build / serve the build  |
| `npm run lint` / `format` / `typecheck` | ESLint / Prettier / `tsc --noEmit`                       |
| `npm test`                              | Unit tests (Vitest)                                      |
| `npm run e2e`                           | Playwright smoke test (builds and starts the app itself) |
| `npm run db:generate`                   | Generate a migration from `db/schema.ts`                 |
| `npm run db:migrate`                    | Apply pending migrations from `db/migrations`            |
| `npm run r2:cors`                       | Apply `infra/r2-cors.json` to the R2 bucket              |

First e2e run locally: `npx playwright install chromium`, or use your own Chrome with
`PW_CHANNEL=chrome npm run e2e`.

## Layout

```
app/            routes (App Router)
features/       player, sync, downloads, catalogue, library, admin — one folder per slice
components/ui/  Sasha UI components
lib/            db (Drizzle client), r2 (storage keys + client), auth
db/             Drizzle schema + SQL migrations
i18n/           locale resolution (cookie → browser → uk), next-intl request config
messages/       uk.json, en.json — every UI string goes through these
scripts/        operational scripts and (later) the content pipeline
infra/          infrastructure config kept in the repo (R2 CORS)
e2e/            Playwright tests
```

## Conventions

- **Database**: only the server talks to Postgres, through `getDb()` in `lib/db`. Schema changes
  go through `db/schema.ts` → `npm run db:generate` → review the SQL → `npm run db:migrate`.
  The v1 tables are parked in the `legacy_v1` schema and are not managed by Drizzle.
- **Storage**: object keys come from `lib/r2/keys.ts` (`books/{bookId}/…`, content-addressed,
  immutable). Never overwrite a key; upload a new one.
- **i18n**: the language is stored in the `locale` cookie, falling back to the browser language,
  then Ukrainian. Add a string to both `messages/uk.json` and `messages/en.json` — a unit test
  fails if the keys differ.
- **Secrets**: `.env` is git-ignored; `.env.example` documents every variable.

## CI and deploys

GitHub Actions runs lint, format check, typecheck, unit tests and the Playwright smoke test on
every pull request. Vercel builds a preview for every pull request and deploys `main` to
production.
