import { defineConfig, devices } from '@playwright/test';
import {
  ADMIN_IMPORT_TOKEN,
  ADMIN_PASSKEYS,
  ADMIN_SESSION_SECRET,
  ADMIN_SETUP_TOKEN,
} from './e2e/fixtures/admin';

const PORT = Number(process.env.PORT ?? 3000);
const E2E_DB_PORT = 54329;
const E2E_R2_PORT = 54330;
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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Tests that create records run after everything else (below): the read-only specs assert
      // exact counts of the seeded catalogue.
      testIgnore: /\.write\.spec\.ts$/,
    },
    {
      name: 'chromium-write',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /\.write\.spec\.ts$/,
      dependencies: ['chromium'],
      // All write specs share one database and each file clears every `E2E ` record around its
      // tests, so they take turns instead of deleting each other's books mid-test.
      workers: 1,
    },
  ],
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
          // Stands in for Cloudflare R2: takes the browser's upload, answers the server's check.
          command: 'node scripts/e2e-r2.mjs',
          port: E2E_R2_PORT,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
          env: { E2E_R2_PORT: String(E2E_R2_PORT) },
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
            S3_ENDPOINT: `http://127.0.0.1:${E2E_R2_PORT}`,
            S3_FORCE_PATH_STYLE: 'true',
            S3_REGION: 'auto',
            S3_ACCESS_KEY_ID: 'e2e',
            S3_SECRET_ACCESS_KEY: 'e2e-secret',
            S3_BUCKET: 'e2e-bucket',
            ADMIN_PASSKEYS,
            ADMIN_SESSION_SECRET,
            ADMIN_SETUP_TOKEN,
            ADMIN_IMPORT_TOKEN,
          },
        },
      ],
});
