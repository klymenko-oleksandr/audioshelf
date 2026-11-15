/**
 * Object keys and public URLs for the R2 bucket (ADR 1).
 *
 * Layout: one folder per book, readable in the Cloudflare dashboard:
 *   books/{book-slug}/audio/{NN}-{chapter-slug}-{hash8}.{ext}
 *   books/{book-slug}/cover/{hash8}-{size}.webp
 * e.g. books/hesse-siddhartha/audio/03-hautama-3fa9c1d2.mp3
 *
 * The short content hash makes every key unique to its bytes: a replaced file gets a new
 * key, nothing is ever overwritten, and objects are served with a one-year immutable cache.
 *
 * Names are a snapshot from upload time. Renaming a book or reordering chapters later does
 * not move files — the app always reads the key stored in the database, never rebuilds it.
 *
 * (The v1 objects under `audio/` and `covers/` stay until the v1 books are migrated.)
 */
import { isSlug, slugify } from '@/lib/slug';

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const AUDIO_EXTENSIONS = ['mp3', 'm4a'] as const;
export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];

export const COVER_SIZES = [1000, 500, 250] as const;
export type CoverSize = (typeof COVER_SIZES)[number];

const HASH_LENGTH = 8;
const CHAPTER_SLUG_MAX = 40;

function bookSegment(bookSlug: string): string {
  if (!isSlug(bookSlug)) throw new Error(`Invalid book slug for an object key: "${bookSlug}"`);
  return bookSlug;
}

/** First 8 hex characters of the file's SHA-256. */
function shortHash(hash: string): string {
  if (!/^[a-f0-9]{8,64}$/.test(hash)) {
    throw new Error(`Invalid content hash for an object key: "${hash}"`);
  }
  return hash.slice(0, HASH_LENGTH);
}

export function bookPrefix(bookSlug: string): string {
  return `books/${bookSegment(bookSlug)}/`;
}

export function trackKey(input: {
  bookSlug: string;
  /** Position of the part in the book, starting at 1. */
  number: number;
  /** Chapter or part title in any script; transliterated and shortened for the file name. */
  title?: string;
  /** Hex SHA-256 of the file (at least the first 8 characters). */
  hash: string;
  ext: AudioExtension;
}): string {
  if (!AUDIO_EXTENSIONS.includes(input.ext)) {
    throw new Error(`Unsupported audio extension: "${input.ext}"`);
  }
  if (!Number.isInteger(input.number) || input.number < 1 || input.number > 9999) {
    throw new Error(`Invalid part number for an object key: ${input.number}`);
  }
  const number = String(input.number).padStart(2, '0');
  const name = input.title ? slugify(input.title, CHAPTER_SLUG_MAX) : '';
  // A title that is only a number ("01") would just repeat the part number: leave it out.
  const parts = [number, /^\d+$/.test(name) ? '' : name, shortHash(input.hash)].filter(Boolean);
  return `${bookPrefix(input.bookSlug)}audio/${parts.join('-')}.${input.ext}`;
}

export function coverKey(input: { bookSlug: string; hash: string; size: CoverSize }): string {
  if (!COVER_SIZES.includes(input.size)) {
    throw new Error(`Unsupported cover size: ${input.size}`);
  }
  return `${bookPrefix(input.bookSlug)}cover/${shortHash(input.hash)}-${input.size}.webp`;
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
