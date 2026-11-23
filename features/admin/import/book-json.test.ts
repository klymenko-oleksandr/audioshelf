import { describe, expect, it } from 'vitest';
import { MAX_BOOK_PARTS, parseBookJson, type ImportIssue, type ParsedBook } from './book-json';

const SHA = 'ab12cd34'.repeat(8);

const part = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `Part ${number}`,
  file: `${String(number).padStart(2, '0')}.mp3`,
  size: 1_000_000,
  sha256: SHA,
  durationSeconds: 600.5,
  ...extra,
});

const book = (extra: Record<string, unknown> = {}) => ({
  slug: 'hesse-siddhartha',
  title: 'Сіддхартха',
  parts: [part(1)],
  ...extra,
});

function errorsOf(result: ParsedBook): ImportIssue[] {
  if (result.ok) throw new Error('expected errors');
  return result.errors;
}
const paths = (result: ParsedBook) => errorsOf(result).map((e) => e.path);

describe('parseBookJson: a valid book', () => {
  it('needs only a slug, a title and one part; everything else gets its default', () => {
    const result = parseBookJson(book());
    expect(result).toMatchObject({ ok: true, warnings: [] });
    if (!result.ok) return;
    expect(result.value).toEqual({
      slug: 'hesse-siddhartha',
      title: 'Сіддхартха',
      author: null,
      narrator: null,
      category: null,
      description: null,
      language: 'uk',
      ongoing: false,
      parts: [
        {
          number: 1,
          title: 'Part 1',
          file: '01.mp3',
          size: 1_000_000,
          sha256: SHA,
          durationSeconds: 600.5,
        },
      ],
    });
  });

  it('reads every field', () => {
    const result = parseBookJson(
      book({
        author: 'Герман  Гессе',
        narrator: ' Імʼя Диктора ',
        category: 'fiction',
        description: 'Line one\r\nLine two  ',
        language: 'en',
        ongoing: true,
        parts: [part(1), part(2, { file: 'two.m4a' })],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      author: 'Герман Гессе',
      narrator: 'Імʼя Диктора',
      category: 'fiction',
      description: 'Line one\nLine two',
      language: 'en',
      ongoing: true,
    });
    expect(result.value.parts.map((p) => p.file)).toEqual(['01.mp3', 'two.m4a']);
  });

  it('treats null and blank optional fields as absent', () => {
    const result = parseBookJson(
      book({ author: null, narrator: '  ', category: '', description: '' }),
    );
    expect(result.ok && result.value).toMatchObject({
      author: null,
      narrator: null,
      category: null,
      description: null,
    });
  });

  it('accepts an upper-case fingerprint and stores it in lower case', () => {
    const result = parseBookJson(book({ parts: [part(1, { sha256: SHA.toUpperCase() })] }));
    expect(result.ok && result.value.parts[0]!.sha256).toBe(SHA);
  });

  it('accepts a cover name but ignores it, with a warning (cover upload is parked)', () => {
    const result = parseBookJson(book({ cover: 'cover.jpg' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty('cover');
    expect(result.warnings).toEqual([expect.stringMatching(/cover/i)]);
  });

  it('allows the limits exactly', () => {
    const result = parseBookJson(
      book({
        title: 'т'.repeat(200),
        description: 'd'.repeat(1000),
        author: 'a'.repeat(120),
        narrator: 'n'.repeat(120),
        parts: [part(1, { size: 500 * 1024 * 1024 })],
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('parseBookJson: the document', () => {
  it.each([null, undefined, 'text', 5, [], [book()]])('refuses %j as a document', (raw) => {
    expect(errorsOf(parseBookJson(raw))[0]).toMatchObject({ path: '' });
  });

  it('refuses unknown fields so a typo is caught instead of ignored', () => {
    const result = parseBookJson(book({ narrater: 'x', parts: [part(1, { durationn: 1 })] }));
    expect(paths(result)).toEqual(expect.arrayContaining(['narrater', 'parts[0].durationn']));
    expect(errorsOf(result).find((e) => e.path === 'narrater')!.message).toMatch(/unknown/i);
  });

  it('collects every problem, with its path, in one answer', () => {
    const result = parseBookJson({
      slug: 'Not A Slug',
      title: '',
      language: 'de',
      ongoing: 'yes',
      parts: [part(1, { size: 0 })],
    });
    expect(paths(result)).toEqual(
      expect.arrayContaining(['slug', 'title', 'language', 'ongoing', 'parts[0].size']),
    );
  });
});

describe('parseBookJson: slug, title and the optional fields', () => {
  it('needs a slug made of lower-case Latin words, at most 60 characters', () => {
    expect(paths(parseBookJson(book({ slug: undefined })))).toContain('slug');
    for (const slug of ['', 'UPPER', 'two words', 'сіддхартха', '-a', 'a-', 'a--b', 'a/b', 5]) {
      expect(paths(parseBookJson(book({ slug }))), String(slug)).toContain('slug');
    }
    expect(parseBookJson(book({ slug: 'a'.repeat(60) })).ok).toBe(true);
    expect(paths(parseBookJson(book({ slug: 'a'.repeat(61) })))).toContain('slug');
  });

  it('needs a title of at most 200 characters', () => {
    expect(paths(parseBookJson(book({ title: undefined })))).toContain('title');
    expect(paths(parseBookJson(book({ title: '   ' })))).toContain('title');
    expect(paths(parseBookJson(book({ title: 5 })))).toContain('title');
    expect(paths(parseBookJson(book({ title: 'т'.repeat(201) })))).toContain('title');
  });

  it('limits names and the description', () => {
    expect(paths(parseBookJson(book({ author: 'a'.repeat(121) })))).toContain('author');
    expect(paths(parseBookJson(book({ narrator: 'n'.repeat(121) })))).toContain('narrator');
    expect(paths(parseBookJson(book({ description: 'd'.repeat(1001) })))).toContain('description');
    expect(paths(parseBookJson(book({ author: 5, narrator: [], description: {} })))).toEqual(
      expect.arrayContaining(['author', 'narrator', 'description']),
    );
  });

  it('takes the category as a slug', () => {
    for (const category of ['Fiction', 'two words', 5, 'a/b']) {
      expect(paths(parseBookJson(book({ category }))), String(category)).toContain('category');
    }
  });

  it('takes only uk or en as the language, and a real boolean for ongoing', () => {
    expect(paths(parseBookJson(book({ language: 'UK' })))).toContain('language');
    expect(paths(parseBookJson(book({ ongoing: 1 })))).toContain('ongoing');
    expect(paths(parseBookJson(book({ ongoing: null })))).toContain('ongoing');
  });
});

describe('parseBookJson: parts', () => {
  it('needs at least one part, and not more than the maximum', () => {
    expect(paths(parseBookJson(book({ parts: [] })))).toContain('parts');
    expect(paths(parseBookJson(book({ parts: undefined })))).toContain('parts');
    expect(paths(parseBookJson(book({ parts: 'x' })))).toContain('parts');
    const many = Array.from({ length: MAX_BOOK_PARTS + 1 }, (_, i) => part(i + 1));
    expect(paths(parseBookJson(book({ parts: many })))).toContain('parts');
    expect(parseBookJson(book({ parts: many.slice(0, MAX_BOOK_PARTS) })).ok).toBe(true);
  });

  it('wants the numbers to be 1, 2, 3… in order, each part listed once', () => {
    for (const numbers of [[2], [1, 3], [2, 1], [1, 1], [0, 1]]) {
      const result = parseBookJson(book({ parts: numbers.map((n) => part(n)) }));
      expect(result.ok, numbers.join()).toBe(false);
      expect(paths(result).some((p) => /^parts\[\d+\]\.number$/.test(p))).toBe(true);
    }
    expect(paths(parseBookJson(book({ parts: [part(1, { number: 1.5 })] })))).toContain(
      'parts[0].number',
    );
    expect(paths(parseBookJson(book({ parts: [part(1, { number: '1' })] })))).toContain(
      'parts[0].number',
    );
  });

  it('needs a title of at most 200 characters for each part', () => {
    expect(paths(parseBookJson(book({ parts: [part(1, { title: '' })] })))).toContain(
      'parts[0].title',
    );
    expect(paths(parseBookJson(book({ parts: [part(1, { title: 'x'.repeat(201) })] })))).toContain(
      'parts[0].title',
    );
  });

  it('takes only MP3 and M4A files, by name, with no folders in the name', () => {
    for (const file of ['a.wav', 'noext', '.mp3', 'dir/a.mp3', 'dir\\a.mp3', '', 5]) {
      expect(paths(parseBookJson(book({ parts: [part(1, { file })] }))), String(file)).toContain(
        'parts[0].file',
      );
    }
    expect(parseBookJson(book({ parts: [part(1, { file: 'A.M4A' })] })).ok).toBe(true);
  });

  it('wants a size from 1 byte up to the 500 MB limit', () => {
    for (const size of [0, -1, 1.5, '10', Number.NaN, 500 * 1024 * 1024 + 1]) {
      expect(paths(parseBookJson(book({ parts: [part(1, { size })] }))), String(size)).toContain(
        'parts[0].size',
      );
    }
  });

  it('wants a 64-character hex SHA-256', () => {
    for (const sha256 of ['', 'abc', 'g'.repeat(64), SHA + 'a', 5, undefined]) {
      expect(
        paths(parseBookJson(book({ parts: [part(1, { sha256 })] }))),
        String(sha256),
      ).toContain('parts[0].sha256');
    }
  });

  it('wants a length above zero in seconds', () => {
    for (const durationSeconds of [0, -3, '60', Number.NaN, Infinity, 1e7]) {
      expect(
        paths(parseBookJson(book({ parts: [part(1, { durationSeconds })] }))),
        String(durationSeconds),
      ).toContain('parts[0].durationSeconds');
    }
  });

  it('names the part in each message', () => {
    const result = parseBookJson(book({ parts: [part(1), part(2, { size: 0 })] }));
    expect(errorsOf(result)).toEqual([
      { path: 'parts[1].size', message: expect.stringContaining('Part 2') },
    ]);
  });

  it('stops reporting after a sensible number of problems', () => {
    const parts = Array.from({ length: 100 }, (_, i) => part(i + 1, { size: 0, sha256: 'x' }));
    expect(errorsOf(parseBookJson(book({ parts }))).length).toBeLessThanOrEqual(50);
  });
});
