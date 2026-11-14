import { describe, expect, it } from 'vitest';
import { bookPrefix, coverKey, publicUrl, trackKey } from './keys';

describe('R2 object keys', () => {
  it('puts everything for a book under books/{bookId}/', () => {
    expect(bookPrefix('b1')).toBe('books/b1/');
    expect(trackKey({ bookId: 'b1', trackId: 't01', hash: 'abc123', ext: 'mp3' })).toBe(
      'books/b1/audio/t01-abc123.mp3',
    );
    expect(coverKey({ bookId: 'b1', hash: 'ff00', size: 500 })).toBe(
      'books/b1/cover/ff00-500.webp',
    );
  });

  it('rejects segments that could escape the book prefix', () => {
    expect(() => bookPrefix('../other')).toThrow(/Invalid bookId/);
    expect(() => trackKey({ bookId: 'b1', trackId: 'a/b', hash: 'x', ext: 'mp3' })).toThrow(
      /Invalid trackId/,
    );
    expect(() => coverKey({ bookId: 'b1', hash: '', size: 250 })).toThrow(/Invalid hash/);
  });

  it('rejects unsupported formats and sizes', () => {
    expect(() =>
      // @ts-expect-error — only mp3 and m4a are accepted (ADR 3)
      trackKey({ bookId: 'b1', trackId: 't', hash: 'h', ext: 'wav' }),
    ).toThrow(/Unsupported audio extension/);
    expect(() =>
      // @ts-expect-error — only the three generated sizes exist
      coverKey({ bookId: 'b1', hash: 'h', size: 123 }),
    ).toThrow(/Unsupported cover size/);
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
