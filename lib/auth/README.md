# lib/auth

Admin sign-in (Phase 4, ADR 5) lives in `admin/`. Supabase Google sign-in comes in Phase 6.

The admin signs in with a **passkey**. Nothing here touches the database, so signing in works even when the database is slow.

- `passkeys.ts` – the registered passkeys (`ADMIN_PASSKEYS`: public keys, not secret).
- `challenge.ts` – the sign-in challenge, kept in a short-lived signed cookie (nothing stored on the server).
- `relying-party.ts` – which site the passkey is for, from the request host.
- `setup-token.ts` – `ADMIN_SETUP_TOKEN`: the one-time key to `/admin/login/setup`, where a passkey is added.
- `session.ts` – signed 12 h JWT cookie `admin_session` (`ADMIN_SESSION_SECRET`).
- `guard.ts` – `requireAdminSession` (pages) and `denyUnlessAdmin` (API handlers).
- `../../proxy.ts` – first gate for `/admin` and `/api/admin`; also sets no-store and noindex headers.
