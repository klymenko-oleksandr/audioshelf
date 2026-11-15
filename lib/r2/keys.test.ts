import { describe, expect, it } from 'vitest';
import { bookPrefix, coverKey, publicUrl, trackKey } from './keys';

const HASH = '3fa9c1d2e5b7a8c90123456789abcdef0123456789abcdef0123456789abcdef';

describe('R2 object keys', () => {
  it('groups everything for a book under books/{book-slug}/', () => {
    expect(bookPrefix('hesse-siddhartha')).toBe('books/hesse-siddhartha/');
  });

  it('names audio files by part number, chapter and a short content hash', () => {
    expect(
      trackKey({
        bookSlug: 'hesse-siddhartha',
        number: 3,
        title: 'Гаутама',
        hash: HASH,
        ext: 'mp3',
      }),
    ).toBe('books/hesse-siddhartha/audio/03-hautama-3fa9c1d2.mp3');
  });

  it('shortens long chapter titles at a word boundary', () => {
    const key = trackKey({
      bookSlug: 'tolkin-bratstvo-persnia',
      number: 13,
      title: 'Розділ 8. Туман понад Курганними Пагорбами',
      hash: HASH,
      ext: 'mp3',
    });
    expect(key).toBe(
      'books/tolkin-bratstvo-persnia/audio/13-rozdil-8-tuman-ponad-kurhannymy-3fa9c1d2.mp3',
    );
  });

  it('falls back to number and hash when there is no usable title', () => {
    const base = { bookSlug: 'orwell-kolhosp-tvaryn', hash: HASH, ext: 'mp3' } as const;
    expect(trackKey({ ...base, number: 1 })).toBe(
      'books/orwell-kolhosp-tvaryn/audio/01-3fa9c1d2.mp3',
    );
    expect(trackKey({ ...base, number: 1, title: '01' })).toBe(
      'books/orwell-kolhosp-tvaryn/audio/01-3fa9c1d2.mp3',
    );
    expect(trackKey({ ...base, number: 1, title: '«…»' })).toBe(
      'books/orwell-kolhosp-tvaryn/audio/01-3fa9c1d2.mp3',
    );
  });

  it('pads part numbers so files sort in order, and copes with long books', () => {
    const base = { bookSlug: 'b', hash: HASH, ext: 'm4a' } as const;
    expect(trackKey({ ...base, number: 9 })).toBe('books/b/audio/09-3fa9c1d2.m4a');
    expect(trackKey({ ...base, number: 10 })).toBe('books/b/audio/10-3fa9c1d2.m4a');
    expect(trackKey({ ...base, number: 123 })).toBe('books/b/audio/123-3fa9c1d2.m4a');
  });

  it('gives a replaced file a new key', () => {
    const base = { bookSlug: 'b', number: 1, title: 'Intro', ext: 'mp3' } as const;
    expect(trackKey({ ...base, hash: HASH })).not.toBe(
      trackKey({ ...base, hash: `aaaaaaaa${HASH.slice(8)}` }),
    );
  });

  it('names covers by hash and size', () => {
    expect(coverKey({ bookSlug: 'hesse-siddhartha', hash: HASH, size: 500 })).toBe(
      'books/hesse-siddhartha/cover/3fa9c1d2-500.webp',
    );
  });

  it('rejects slugs and hashes that could escape the book folder or are not real', () => {
    expect(() => bookPrefix('../other')).toThrow(/Invalid book slug/);
    expect(() => bookPrefix('Сіддхартха')).toThrow(/Invalid book slug/);
    expect(() => bookPrefix('')).toThrow(/Invalid book slug/);
    expect(() => coverKey({ bookSlug: 'b', hash: 'xyz', size: 250 })).toThrow(
      /Invalid content hash/,
    );
    expect(() => coverKey({ bookSlug: 'b', hash: '../../etc', size: 250 })).toThrow(
      /Invalid content hash/,
    );
  });

  it('rejects unsupported formats, sizes and part numbers', () => {
    const base = { bookSlug: 'b', hash: HASH } as const;
    expect(() =>
      // @ts-expect-error — only mp3 and m4a are accepted (ADR 3)
      trackKey({ ...base, number: 1, ext: 'wav' }),
    ).toThrow(/Unsupported audio extension/);
    expect(() =>
      // @ts-expect-error — only the three generated sizes exist
      coverKey({ ...base, size: 123 }),
    ).toThrow(/Unsupported cover size/);
    for (const number of [0, -1, 1.5, Number.NaN]) {
      expect(() => trackKey({ ...base, number, ext: 'mp3' })).toThrow(/Invalid part number/);
    }
  });
});

describe('publicUrl', () => {
  it('joins the base URL and key without doubling slashes', () => {
    expect(publicUrl('books/b1/audio/t-h.mp3', 'https://media.example.com/')).toBe(
      'https://media.example.com/books/b1/audio/t-h.mp3',
    );
    expect(publicUrl('/books/b1/cover/h-250.webp', 'https://media.example.com')).toBe(
      'https://media.example.com/books/b1/cover/h-250.webp',
    );
  });

  it('percent-encodes legacy keys with unusual characters', () => {
    expect(publicUrl('audio/1700000000-ab12cd-Розділ 1.mp3', 'https://m.example.com')).toBe(
      'https://m.example.com/audio/1700000000-ab12cd-%D0%A0%D0%BE%D0%B7%D0%B4%D1%96%D0%BB%201.mp3',
    );
  });

  it('fails loudly when the base URL is not configured', () => {
    expect(() => publicUrl('books/b1/x', '')).toThrow(/NEXT_PUBLIC_MEDIA_BASE_URL/);
  });
});
