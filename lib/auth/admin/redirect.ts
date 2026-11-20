export const DEFAULT_ADMIN_PATH = '/admin/books';
export const LOGIN_PATH = '/admin/login';

/**
 * Where to go after signing in. `next` comes from the URL, so it is only trusted when it is a
 * path inside the admin panel: anything else (another site, `//host`, `..`, header-splitting
 * characters, the login page itself) falls back to the books list.
 */
export function safeNextPath(next: string | undefined | null): string {
  if (!next || !next.startsWith('/admin')) return DEFAULT_ADMIN_PATH;
  const rest = next.slice('/admin'.length);
  if (rest !== '' && !/^[/?]/.test(rest)) return DEFAULT_ADMIN_PATH;
  if (/[\\\s]|\.\./.test(next) || next.startsWith('//')) return DEFAULT_ADMIN_PATH;
  const path = next.split('?')[0]!;
  if (path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`)) return DEFAULT_ADMIN_PATH;
  return next;
}

/** The login URL for a visitor who asked for `pathname` + `search` without a session. */
export function loginHref(pathname: string, search: string): string {
  const target = safeNextPath(`${pathname}${search}`);
  const isDefault = target === DEFAULT_ADMIN_PATH || target === '/admin';
  return isDefault || !pathname.startsWith('/admin')
    ? LOGIN_PATH
    : `${LOGIN_PATH}?next=${encodeURIComponent(target)}`;
}
