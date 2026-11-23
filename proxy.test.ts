// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSessionToken, ADMIN_SESSION_COOKIE } from '@/lib/auth/admin/session';
import { proxy } from './proxy';

const SECRET = 'p'.repeat(48);

beforeAll(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

async function call(path: string, token?: string) {
  const headers = new Headers();
  if (token) headers.set('cookie', `${ADMIN_SESSION_COOKIE}=${token}`);
  return proxy(new NextRequest(`http://localhost${path}`, { headers }));
}

describe('proxy: signed out', () => {
  it('sends an admin page to the login, remembering where it was going', async () => {
    const res = await call('/admin/books?tab=draft');
    expect(res.status).toBe(307);
    expect(
      new URL(res.headers.get('location')!).pathname + new URL(res.headers.get('location')!).search,
    ).toBe('/admin/login?next=%2Fadmin%2Fbooks%3Ftab%3Ddraft');
  });

  it('sends /admin itself to the plain login', async () => {
    const res = await call('/admin');
    expect(new URL(res.headers.get('location')!).pathname).toBe('/admin/login');
    expect(new URL(res.headers.get('location')!).search).toBe('');
  });

  it('answers 401 JSON, not a redirect, for the admin API', async () => {
    const res = await call('/api/admin/books');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('lets the passkey setup page through: it has its own one-time token', async () => {
    const res = await call('/admin/login/setup?token=abc');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });

  it('lets the login page through', async () => {
    const res = await call('/admin/login');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('treats a bad, expired or foreign token as signed out', async () => {
    const other = await createSessionToken('q'.repeat(48));
    const expired = await createSessionToken(SECRET, new Date('2020-01-01T00:00:00Z'));
    for (const token of ['garbage', other, expired]) {
      expect((await call('/admin/books', token)).status).toBe(307);
      expect((await call('/api/admin/books', token)).status).toBe(401);
    }
  });

  it('treats everyone as signed out when the secret is not configured', async () => {
    const token = await createSessionToken(SECRET);
    delete process.env.ADMIN_SESSION_SECRET;
    try {
      expect((await call('/admin/books', token)).status).toBe(307);
    } finally {
      process.env.ADMIN_SESSION_SECRET = SECRET;
    }
  });
});

describe('proxy: signed in', () => {
  it('lets admin pages and the admin API through', async () => {
    const token = await createSessionToken(SECRET);
    for (const path of ['/admin/books', '/admin', '/api/admin/books']) {
      const res = await call(path, token);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('x-middleware-next'), path).toBe('1');
    }
  });

  it('moves a signed-in owner from the login page to the books list', async () => {
    const token = await createSessionToken(SECRET);
    const res = await call('/admin/login', token);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/admin/books');
  });
});

describe('proxy: every response is private and unindexable', () => {
  it.each(['/admin/login', '/admin/books', '/api/admin/books'])('%s', async (path) => {
    const res = await call(path);
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(res.headers.get('vary')).toContain('Cookie');
  });
});

describe('proxy: content import (bearer token, Phase 4e)', () => {
  const IMPORT_TOKEN = 'import-secret-'.padEnd(48, 'z');
  const PATHS = ['/api/admin/import', '/api/admin/import/complete'];

  beforeAll(() => {
    process.env.ADMIN_IMPORT_TOKEN = IMPORT_TOKEN;
  });

  async function callWith(path: string, headers: Record<string, string>) {
    return proxy(
      new NextRequest(`http://localhost${path}`, { method: 'POST', headers: new Headers(headers) }),
    );
  }

  it.each(PATHS)('refuses %s without a token with 401 JSON', async (path) => {
    const res = await callWith(path, {});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it.each(PATHS)('refuses %s with a wrong token', async (path) => {
    expect((await callWith(path, { authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await callWith(path, { authorization: `Bearer ${IMPORT_TOKEN}x` })).status).toBe(401);
    expect((await callWith(path, { authorization: IMPORT_TOKEN })).status).toBe(401);
  });

  it.each(PATHS)('lets %s through with the right token', async (path) => {
    const res = await callWith(path, { authorization: `Bearer ${IMPORT_TOKEN}` });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it.each(PATHS)('does not open %s to an admin session cookie', async (path) => {
    const session = await createSessionToken(SECRET);
    const res = await callWith(path, { cookie: `${ADMIN_SESSION_COOKIE}=${session}` });
    expect(res.status).toBe(401);
  });

  it('stays closed when the token is not configured, even for an empty Bearer match', async () => {
    delete process.env.ADMIN_IMPORT_TOKEN;
    try {
      expect((await callWith('/api/admin/import', { authorization: 'Bearer ' })).status).toBe(401);
      expect(
        (await callWith('/api/admin/import', { authorization: `Bearer ${IMPORT_TOKEN}` })).status,
      ).toBe(401);
    } finally {
      process.env.ADMIN_IMPORT_TOKEN = IMPORT_TOKEN;
    }
  });

  it('does not let the import token open any other admin route', async () => {
    const headers = { authorization: `Bearer ${IMPORT_TOKEN}` };
    for (const path of ['/api/admin/books', '/api/admin/importer', '/api/admin/imports']) {
      expect((await callWith(path, headers)).status, path).toBe(401);
    }
    const page = await callWith('/admin/books', headers);
    expect(page.status).toBe(307);
  });

  it.each(PATHS)('marks %s private and unindexable', async (path) => {
    for (const res of [
      await callWith(path, {}),
      await callWith(path, { authorization: `Bearer ${IMPORT_TOKEN}` }),
    ]) {
      expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    }
  });
});
