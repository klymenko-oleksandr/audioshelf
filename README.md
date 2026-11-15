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
components/shell/  app shell: sidebar, icon rail, tab bar, top bar
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

## Design system

Tokens live in `app/globals.css` (Sasha UI: Nova, zinc, green primary) and are exposed as Tailwind
colours (`bg-primary`, `text-muted-foreground`, `text-brand`, …) and type utilities (`text-h1` …
`text-caption`). Colours use `light-dark()`: the theme follows the system and can be forced with
`data-theme="light|dark"` on `<html>`. Use `text-brand` for green text and icons, never
`text-primary`. `lib/ui/tokens.test.ts` checks the contrast of every pair the UI relies on.
Components come from shadcn/ui (`components.json`: base-nova style, Base UI primitives, Remix
icons): `npx shadcn@latest add <component>` writes into `components/ui/`. After adding one:
remove its `focus-visible:ring-*` / `focus-visible:border-ring` classes (the global solid focus
ring in `globals.css` replaces shadcn's faint halo) and swap `text-primary` for `text-brand`.
Fonts are self-hosted (Fontsource): Instrument Sans for headings — with Geist as the Cyrillic
fallback, because Instrument Sans has no Cyrillic — and Geist Mono for everything else.

## Shared UI behaviours

- **Toasts** — `toast({ title, description?, icon?, action?, variant?, onDismiss? })` from
  `@/components/ui/toast`. One at a time; 5 s, or 8 s with an action; errors stay until closed.
  Put delayed work (deleting a removed download) in `onDismiss` and skip it when the reason is
  `'action'` (the user pressed Undo).
- **Loaders** — `useDelayedLoading(loading)` from `@/hooks/use-delayed-loading` returns whether
  a skeleton or spinner should be on screen: nothing for 300 ms, then at least 600 ms.
- **Errors** — `app/error.tsx` replaces only the page content; the shell and player stay.
- **Splash** — `components/shell/splash.tsx`, static HTML and CSS shown until hydration.
  Append `?splash=hold` to any URL to keep it up and see the 3 s and 15 s messages.
- **Bottom sheets** — `BottomSheet` + `SheetAction` from `@/components/ui/bottom-sheet`. They
  close on tap outside, Esc and the browser Back button (`useCloseOnBack`). To navigate from
  inside an open sheet use `router.replace()`, which swaps the sheet's history entry.
- **Menus** — `@/components/ui/dropdown-menu`, restyled to the inverted translucent `--menu-*`
  surface.
- **Touch vs pointer** — the `touch:` variant targets devices without hover.
- **BookCard** (`features/catalogue/components`) and **PlayerBarView**
  (`features/player/components`) are presentational: data in, callbacks out.
- **Showcase** — `/dev/ui` demonstrates all of the above (hidden in production).
