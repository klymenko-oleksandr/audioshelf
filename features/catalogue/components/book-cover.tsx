import { cn } from '@/lib/utils';

/** Generated cover palettes from the canvas, used when a book has no poster. */
const TONES = {
  ink: 'bg-foreground text-background',
  green: 'bg-primary text-primary-foreground',
  stone: 'bg-chart-3 text-zinc-50',
  mist: 'bg-chart-1 text-chart-5',
  deep: 'bg-chart-5 text-chart-1',
  lime: 'bg-sidebar-primary text-chart-5',
} as const;

export type CoverTone = keyof typeof TONES;
const toneNames = Object.keys(TONES) as CoverTone[];

/** Stable tone for a book, so its generated cover looks the same everywhere. */
export function toneFor(seed: string): CoverTone {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return toneNames[hash % toneNames.length]!;
}

interface BookCoverProps {
  title: string;
  author?: string;
  /** Poster URL (square). Without it a typographic cover is generated. */
  src?: string;
  tone?: CoverTone;
  /** Seed for the generated tone when `tone` is not given (use the book slug). */
  seed?: string;
  /** Keep the bottom of a generated cover clear for badges that sit on it. */
  reserveBottom?: boolean;
  className?: string;
}

/**
 * Square book cover. Sizes itself to its container; the generated cover scales its type with
 * the container width, so the same component works at 40 px in the player and 168 px in a grid.
 */
export function BookCover({
  title,
  author,
  src,
  tone,
  seed,
  reserveBottom = false,
  className,
}: BookCoverProps) {
  if (src) {
    return (
      // Posters come from the R2 CDN in fixed sizes; next/image would only re-encode them.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn('bg-muted aspect-square w-full rounded-[inherit] object-cover', className)}
      />
    );
  }

  // The container and the padded box are separate elements: cqw units on the container
  // itself would resolve against its ancestor, not against the cover.
  return (
    <div
      aria-hidden
      className={cn(
        '@container aspect-square w-full overflow-hidden rounded-[inherit]',
        TONES[tone ?? toneFor(seed ?? title)],
        className,
      )}
    >
      <div
        className={cn(
          'flex size-full flex-col justify-between p-[8.5cqw]',
          reserveBottom && 'pb-[calc(8.5cqw+32px)]',
        )}
      >
        <span className="text-[clamp(0px,6cqw,10px)] leading-[1.3] font-medium tracking-[0.04em] uppercase opacity-80 @max-[100px]:invisible">
          {author}
        </span>
        <span className="font-heading line-clamp-4 text-[clamp(8px,12cqw,20px)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
          {title}
        </span>
      </div>
    </div>
  );
}
