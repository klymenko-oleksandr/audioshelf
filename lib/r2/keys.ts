/**
 * Object keys and public URLs for the R2 bucket (ADR 1).
 *
 * Layout: everything for a book lives under `books/{bookId}/`:
 *   books/{bookId}/audio/{trackId}-{hash}.{ext}
 *   books/{bookId}/cover/{hash}-{size}.webp
 *
 * Keys are content-addressed and never overwritten — replacing a file means a new
 * key — so objects are served with a one-year immutable cache.
 *
 * (The v1 objects under `audio/` and `covers/` stay until the v1 books are migrated.)
 */

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const AUDIO_EXTENSIONS = ['mp3', 'm4a'] as const;
export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];

export const COVER_SIZES = [1000, 500, 250] as const;
export type CoverSize = (typeof COVER_SIZES)[number];

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

function segment(name: string, value: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`Invalid ${name} for an object key: "${value}"`);
  }
  return value;
}

export function bookPrefix(bookId: string): string {
  return `books/${segment('bookId', bookId)}/`;
}

export function trackKey(input: {
  bookId: string;
  trackId: string;
  hash: string;
  ext: AudioExtension;
}): string {
  if (!AUDIO_EXTENSIONS.includes(input.ext)) {
    throw new Error(`Unsupported audio extension: "${input.ext}"`);
  }
  return `${bookPrefix(input.bookId)}audio/${segment('trackId', input.trackId)}-${segment('hash', input.hash)}.${input.ext}`;
}

export function coverKey(input: { bookId: string; hash: string; size: CoverSize }): string {
  if (!COVER_SIZES.includes(input.size)) {
    throw new Error(`Unsupported cover size: ${input.size}`);
  }
  return `${bookPrefix(input.bookId)}cover/${segment('hash', input.hash)}-${input.size}.webp`;
}

/**
 * Public CDN URL for an object. `baseUrl` defaults to NEXT_PUBLIC_MEDIA_BASE_URL
 * (the bucket's custom domain), which is inlined for client code at build time.
 */
export function publicUrl(key: string, baseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL): string {
  if (!baseUrl) {
    throw new Error('Missing environment variable NEXT_PUBLIC_MEDIA_BASE_URL — see .env.example.');
  }
  const path = key.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/${path}`;
}
