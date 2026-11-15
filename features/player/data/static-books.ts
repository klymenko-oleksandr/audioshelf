import { publicUrl } from '@/lib/r2/keys';
import { chaptersFromTracks, type PlayerBook } from '../core';

/**
 * TEMPORARY (Phase 2): the four v1 books as static data, pointing at the v1 objects that are
 * still in the bucket under `audio/` and `covers/`. Titles, keys and durations were copied
 * from the `legacy_v1` tables on 15 Nov 2026.
 *
 * Phase 3 replaces this with the database; content track C1 re-encodes these books to
 * 64 kbps mono under `books/…` and the old objects are deleted.
 *
 * Known v1 data problem, kept as is: in "Братство персня" chapter 7 points at a file with the
 * same name and duration as chapter 12, so chapter 7 probably plays chapter 12's audio.
 */
type RawChapter = readonly [title: string, key: string, seconds: number];
interface RawBook {
  id: string;
  slug: string;
  title: string;
  author: string;
  cover: string;
  chapters: readonly RawChapter[];
}

const RAW: readonly RawBook[] = [
  {
    id: 'cmjetnl8m0002w69438ax1ppv',
    slug: 'hesse-siddhartha',
    title: 'Сіддхартха',
    author: 'Герман Гессе',
    cover: 'covers/1766266773656-g8xci1-photo_2025-12-20_23.35.53.jpeg',
    chapters: [
      [
        'Брахманський син',
        'audio/1766266774001-uzc5s8-01._____________________________.mp3',
        1443.53,
      ],
      ['У саман', 'audio/1766266775903-pfdnuv-02.____________________.mp3', 1742.74],
      ['Гаутама', 'audio/1766266778839-du8n3l-03.____________________.mp3', 1634.59],
      ['Пробудження', 'audio/1766266781540-9ydxrz-04.________________________mp3.mp3', 723.58],
      ['Камала', 'audio/1766266783020-epzyz2-05.___________________.mp3', 2285.06],
      [
        'Серед звичайних людей',
        'audio/1766266786694-dmnrh1-06___________________________________.mp3',
        1446.41,
      ],
      ['Сансара', 'audio/1766266789215-m2sjac-07.____________________.mp3', 1665.29],
      ['На річці', 'audio/1766266791599-gsg8g9-08._____________________.mp3', 2111.3],
      ['Перевізник', 'audio/1766266796976-8o1avn-09._______________________.mp3', 2237.4],
      ['Син', 'audio/1766266801016-6db19j-010.________________.mp3', 1599.86],
      ['Ом', 'audio/1766266804712-fssnp8-011._______________.mp3', 1303.22],
      ['Говінда', 'audio/1766266807140-0ld53l-012.____________________.mp3', 2098.22],
    ],
  },
  {
    id: 'cmjha80fa0000y8mpdj47z6tz',
    slug: 'orwell-kolhosp-tvaryn',
    title: 'Колгосп тварин',
    author: 'Джордж Орвелл',
    cover: 'covers/1766437076332-asn77r-image.png',
    chapters: [
      ['Розділ 1', 'audio/1766415559858-bfxq7y-01_______________-___________.mp3', 1154.85],
      ['Розділ 2', 'audio/1766415564317-ypi4fd-02_______________-___________.mp3', 528.4],
      ['Розділ 3', 'audio/1766415566697-qarwcl-03_______________-___________.mp3', 578.64],
      ['Розділ 4', 'audio/1766437076951-94u25s-04_______________-___________.mp3', 1122.46],
      ['Розділ 5', 'audio/1766437078845-2zbfhl-05_______________-___________.mp3', 720.69],
      ['Розділ 6', 'audio/1766437080142-q17fxd-06_______________-___________.mp3', 1064.72],
      ['Розділ 7', 'audio/1766437082058-wt67bo-07_______________-___________.mp3', 448.34],
      ['Розділ 8', 'audio/1766437083178-e3mkeb-08_______________-___________.mp3', 745.22],
    ],
  },
  {
    id: 'cmjetgivj0000w69407v3o0v5',
    slug: 'raspe-pryhody-barona-miunkhauzena',
    title: 'Пригоди барона Мюнхаузена',
    author: 'Рудольф Еріх Распе',
    cover: 'covers/1766266469970-xskgzu-photo_2025-12-20_23.32.57.jpeg',
    chapters: [
      [
        'Пригоди барона Мюнхаузена',
        'audio/1766266470405-zvnk0j-_________________________.mp3',
        6153.5,
      ],
    ],
  },
  {
    id: 'cmjak7xzn0000htjw4tydkiu5',
    slug: 'tolkin-bratstvo-persnia',
    title: 'Братство персня',
    author: 'Джон Толкін',
    cover: 'covers/1766045514667-jp9e6v-photo_2025-12-18_10.09.58.jpeg',
    chapters: [
      ['Пролог. Про гобітів', 'audio/1766009094122-jworjv-01._______.____________.mp3', 1792.27],
      ['Про люлькове зілля', 'audio/1766009097111-fnnm05-02.___________________.mp3', 325.97],
      ['Про устрій Ширу', 'audio/1766050776776-j0obko-03._________________.mp3', 421.22],
      [
        'Про віднайдення Персня',
        'audio/1766050777735-qqjt1h-04.________________________.mp3',
        844.46,
      ],
      [
        'Зауваги щодо ширських літописів',
        'audio/1766050779202-69aeq8-05________________________________.mp3',
        463.99,
      ],
      [
        'Розділ 1. Довгоочікувана гостина',
        'audio/1766050779850-5ttugj-06_______1________1_______________________.mp3',
        5120.26,
      ],
      [
        'Розділ 2. Тінь минулого',
        'audio/1766050785585-eir579-012.________7.______________________.mp3',
        2742.5,
      ],
      [
        'Розділ 3. Троє — це вже загін',
        'audio/1766050789208-aqco2j-08.________3.____________________.mp3',
        4859.3,
      ],
      [
        'Розділ 4. Навпростець по гриби',
        'audio/1766050797575-n602ge-09.________4._____________________.mp3',
        2610.72,
      ],
      [
        'Розділ 5. Змову викрито',
        'audio/1766050803065-rh0xbk-010.________5.______________.mp3',
        2367.31,
      ],
      ['Розділ 6. Праліс', 'audio/1766050807535-0v5a7d-011.________6._______.mp3', 3147.89],
      [
        'Розділ 7. У домі Тома Бомбадила',
        'audio/1766050812350-msfp4v-012.________7.______________________.mp3',
        2742.5,
      ],
      [
        'Розділ 8. Туман понад Курганними Пагорбами',
        'audio/1766050817043-4q7gp8-013________8_________________________________.mp3',
        3275.4,
      ],
      [
        'Розділ 9. Під вивіскою «Брикливий поні»',
        'audio/1766050822155-o97w8w-014________9_______________________________.mp3',
        2601.74,
      ],
      ['Розділ 10. Бурлака', 'audio/1766050826237-trb014-015.________10.________.mp3', 2837.76],
      [
        'Розділ 11. Ніж у темряві',
        'audio/1766050830702-hwe5xf-016.________11.______________.mp3',
        4497.24,
      ],
      [
        'Розділ 12. Втеча до Броду',
        'audio/1766050838200-s948mm-017.________12._______________.mp3',
        4220.59,
      ],
    ],
  },
];

/** The dev-URL fallback keeps local runs and tests working without an .env file. */
const MEDIA_BASE =
  process.env.NEXT_PUBLIC_MEDIA_BASE_URL || 'https://pub-7ddca733a83f439db26bf0870cfe3f84.r2.dev';

function toBook(raw: RawBook): PlayerBook {
  const tracks = raw.chapters.map(([, key, duration], index) => ({
    id: `${raw.id}-${index + 1}`,
    url: publicUrl(key, MEDIA_BASE),
    duration,
  }));
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    author: raw.author,
    coverUrl: publicUrl(raw.cover, MEDIA_BASE),
    tracks,
    chapters: chaptersFromTracks(tracks, (index) => raw.chapters[index]![0]),
    ongoing: false,
  };
}

/**
 * Three short generated tones (about 6 s, 6 s, 4 s) under /dev/audio. Used by the showcase and the
 * end-to-end tests so playback can be exercised without the network.
 */
export const TEST_BOOK: PlayerBook = (() => {
  const tracks = [6.03, 6.03, 4.05].map((duration, index) => ({
    id: `test-${index + 1}`,
    url: `/dev/audio/tone-${index + 1}.mp3`,
    duration,
  }));
  return {
    id: 'test-book',
    slug: 'test-book',
    title: 'Test book',
    author: 'Three short tones',
    tracks,
    chapters: chaptersFromTracks(tracks, (index) => `Tone ${index + 1}`),
    ongoing: false,
  };
})();

export const STATIC_BOOKS: readonly PlayerBook[] = RAW.map(toBook);

const BY_ID = new Map([...STATIC_BOOKS, TEST_BOOK].map((book) => [book.id, book]));
const BY_SLUG = new Map([...STATIC_BOOKS, TEST_BOOK].map((book) => [book.slug, book]));

export const findBookById = (id: string): PlayerBook | undefined => BY_ID.get(id);
export const findBookBySlug = (slug: string): PlayerBook | undefined => BY_SLUG.get(slug);
