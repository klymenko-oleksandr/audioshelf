# lib/auth

Admin password session (Phase 4, ADR 5) lives in `admin/`. Supabase Google sign-in comes in Phase 6.

- `password.ts` – scrypt hash check (`ADMIN_PASSWORD_HASH`, made with `npm run admin:hash`).
- `session.ts` – signed 12 h JWT cookie `admin_session` (`ADMIN_SESSION_SECRET`).
- `lockout.ts`, `attempts.ts` – per-IP lockout: 5 wrong passwords lock that IP for 15 min. Other IPs are never affected.
- `login.ts` – ties the above together for the sign-in action.
- `guard.ts` – `requireAdminSession` (pages) and `denyUnlessAdmin` (API handlers).
- `../../proxy.ts` – first gate for `/admin` and `/api/admin`; also sets no-store and noindex headers.
