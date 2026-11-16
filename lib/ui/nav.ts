/**
 * True when `pathname` is `href` or a page below it. `/` only matches itself.
 * `also` lists other sections that belong to the same nav item (Explore also covers
 * category and author pages).
 */
export function isActivePath(
  pathname: string,
  href: string,
  also: readonly string[] = [],
): boolean {
  if (href === '/') return pathname === '/';
  return [href, ...also].some((base) => pathname === base || pathname.startsWith(`${base}/`));
}
