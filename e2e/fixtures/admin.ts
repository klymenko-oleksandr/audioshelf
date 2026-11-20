import { scryptSync } from 'node:crypto';

/**
 * Admin credentials for the end-to-end run. Playwright passes the hash and the secret to the
 * server it starts (playwright.config.ts) and the tests type the password. A fixed salt keeps
 * the hash the same between runs, so a server left running from an earlier run still accepts it.
 */
export const ADMIN_PASSWORD = 'e2e-admin-password';
const salt = Buffer.from('e2e-fixed-salt!!');
export const ADMIN_PASSWORD_HASH = `scrypt.${salt.toString('base64url')}.${scryptSync(ADMIN_PASSWORD, salt, 64).toString('base64url')}`;
export const ADMIN_SESSION_SECRET = 'e2e-session-secret-0123456789-abcdefghijklmnop';
