/**
 * Reads a required environment variable at call time (not import time),
 * so `next build` and unit tests work without secrets.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name} — see .env.example.`);
  }
  return value;
}
