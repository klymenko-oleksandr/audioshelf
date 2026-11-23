import {
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiForward10Line,
  RiForward15Line,
  RiForward30Line,
  RiReplay10Line,
  RiReplay15Line,
  RiReplay30Line,
} from '@remixicon/react';

const BACK = { 10: RiReplay10Line, 15: RiReplay15Line, 30: RiReplay30Line } as const;
const FORWARD = { 10: RiForward10Line, 15: RiForward15Line, 30: RiForward30Line } as const;

/**
 * The skip arrow for a configured interval. Remix ships numbered icons for some values only
 * (no 60 s forward), so any other value gets a plain arrow with the number beside it.
 */
export function SkipIcon({
  direction,
  seconds,
  size,
}: {
  direction: 'back' | 'forward';
  seconds: number;
  size: number;
}) {
  const Numbered = (direction === 'back' ? BACK : FORWARD)[seconds as keyof typeof BACK];
  if (Numbered) return <Numbered size={size} aria-hidden />;
  const Arrow = direction === 'back' ? RiArrowGoBackLine : RiArrowGoForwardLine;
  return (
    <span className="relative grid place-items-center" aria-hidden>
      <Arrow size={size} />
      <span
        className="absolute text-[0.55em] leading-none font-semibold tabular-nums"
        style={{ fontSize: size * 0.34 }}
      >
        {seconds}
      </span>
    </span>
  );
}
