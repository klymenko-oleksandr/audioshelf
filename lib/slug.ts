/**
 * Latin slugs for URLs and storage keys: "Сіддхартха" → "siddkhartkha".
 *
 * Ukrainian is transliterated by the official romanisation (Cabinet of Ministers, 2010):
 * є, ї, й, ю, я differ at the start of a word, "зг" becomes "zgh", the soft sign and the
 * apostrophe are dropped. Everything else that is not a Latin letter or a digit becomes a
 * hyphen.
 */
const UK: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ie',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'iu',
  я: 'ia',
};
const UK_WORD_START: Record<string, string> = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' };
const APOSTROPHES = /['’ʼ`]/g;

export function transliterate(text: string): string {
  const lower = text.toLowerCase().normalize('NFC').replace(APOSTROPHES, '');
  let out = '';
  for (let i = 0; i < lower.length; i++) {
    const char = lower[i]!;
    const previous = lower[i - 1];
    const atWordStart = previous === undefined || !/[\p{L}\p{N}]/u.test(previous);

    if (char === 'г' && previous === 'з') out += 'gh';
    else if (atWordStart && char in UK_WORD_START) out += UK_WORD_START[char];
    else if (char in UK) out += UK[char];
    else out += char;
  }
  // Latin letters with diacritics (é, ö) lose them; anything else is handled by slugify.
  return out.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Lowercase ASCII words joined by hyphens, at most `maxLength` characters, cut at a word
 * boundary where possible. Returns '' when nothing usable is left.
 */
export function slugify(text: string, maxLength = 60): string {
  const slug = transliterate(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;

  const cut = slug.slice(0, maxLength);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > maxLength / 2 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, '');
}

export function isSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
