import { defineConfig, devices } from '@playwright/test';
import { ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET } from './e2e/fixtures/admin';

const PORT = Number(process.env.PORT ?? 3000);
const E2E_DB_PORT = 54329;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    // PW_CHANNEL=chrome uses the locally installed Chrome instead of the bundled Chromium.
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Skipped when PLAYWRIGHT_BASE_URL points at an already running deployment.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          // In-memory Postgres with the migrations and e2e/fixtures/catalogue.sql.
          command: 'node scripts/e2e-db.mjs',
          port: E2E_DB_PORT,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          env: { E2E_DB_PORT: String(E2E_DB_PORT) },
        },
        {
          command: `npm run build && npm run start -- -p ${PORT}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          // These win over .env, so a local run never touches the real database or bucket.
          env: {
            DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${E2E_DB_PORT}/postgres`,
            NEXT_PUBLIC_MEDIA_BASE_URL: `http://localhost:${PORT}/dev/audio`,
            ADMIN_PASSWORD_HASH,
            ADMIN_SESSION_SECRET,
          },
        },
      ],
});
