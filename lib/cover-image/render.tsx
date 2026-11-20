import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { COVER_TONE_COLORS, toneFor } from '@/features/catalogue/cover-tones';

/**
 * The generated typographic cover (the design's book cover: author small and upper-case at
 * the top, title at the bottom, one of six palettes) as a PNG, for places that need an image
 * and cannot draw the CSS cover: link previews (Open Graph) and the lock-screen artwork.
 *
 * Geist (SIL OFL, see GEIST-LICENSE.txt) in Latin and Cyrillic, because the default font of
 * the image renderer has no Cyrillic.
 */
// Read from disk (not fetch): Node's fetch cannot load file: URLs. next.config traces these files.
const FONT_DIR = 'lib/cover-image';
const fonts = Promise.all([
  readFile(path.join(process.cwd(), FONT_DIR, 'geist-latin-600-normal.woff')),
  readFile(path.join(process.cwd(), FONT_DIR, 'geist-cyrillic-600-normal.woff')),
]).then(
  ([latin, cyrillic]) =>
    [
      { name: 'Geist', data: latin, weight: 600, style: 'normal' },
      { name: 'Geist Cyrillic', data: cyrillic, weight: 600, style: 'normal' },
    ] as const,
);

export interface CoverImageOptions {
  slug: string;
  title: string;
  author?: string;
  /** Pixels; a square cover is `size` × `size`, a wide one `width` × `height`. */
  width: number;
  height: number;
  /** Prints the app name in the corner (link previews). */
  brand?: string;
  headers?: HeadersInit;
}

export async function coverImage({
  slug,
  title,
  author,
  width,
  height,
  brand,
  headers,
}: CoverImageOptions): Promise<ImageResponse> {
  const { background, color } = COVER_TONE_COLORS[toneFor(slug)];
  // Proportions follow the on-screen cover: padding 8.5 % of the side, title about 1/9 of it.
  const unit = Math.min(width, height);
  const padding = Math.round(unit * 0.085);
  const wide = width > height * 1.2;
  const titleSize = Math.round(unit * (wide ? 0.15 : 0.1));
  const authorSize = Math.round(unit * (wide ? 0.04 : 0.032));

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding,
        background,
        color,
        fontFamily: 'Geist, Geist Cyrillic',
        fontWeight: 600,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: authorSize,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          opacity: 0.8,
        }}
      >
        {author ?? ''}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div
          style={{
            display: 'flex',
            maxWidth: wide ? '78%' : '100%',
            fontSize: titleSize,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            lineClamp: 4,
          }}
        >
          {title}
        </div>
        {brand ? (
          <div style={{ display: 'flex', fontSize: authorSize, opacity: 0.8 }}>{brand}</div>
        ) : null}
      </div>
    </div>,
    { width, height, fonts: [...(await fonts)], headers },
  );
}
