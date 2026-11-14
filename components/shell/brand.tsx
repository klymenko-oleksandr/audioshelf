import { RiHeadphoneLine } from '@remixicon/react';
import Link from 'next/link';

export function BrandMark({ size = 32 }: { size?: 28 | 32 | 36 }) {
  return (
    <span
      className="bg-primary text-primary-foreground grid shrink-0 place-items-center rounded-md"
      style={{ width: size, height: size }}
    >
      <RiHeadphoneLine size={size >= 36 ? 20 : size >= 32 ? 18 : 16} aria-hidden />
    </span>
  );
}

export function BrandLink({ name, compact = false }: { name: string; compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md">
      <BrandMark size={compact ? 28 : 32} />
      <span
        className={
          compact
            ? 'font-heading text-[18px] font-semibold tracking-[-0.02em]'
            : 'font-heading text-[20px] font-semibold tracking-[-0.02em]'
        }
      >
        {name}
      </span>
    </Link>
  );
}
