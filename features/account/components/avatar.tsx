import { cn } from '@/lib/utils';
import type { Account } from '../account';

/** Up to two letters from the name (or the email), for when there is no profile picture. */
export function initials(account: Pick<Account, 'name' | 'email'>): string {
  const source = account.name.trim() || account.email.trim();
  const letters = source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]!.toUpperCase());
  return letters.join('') || '?';
}

/** The listener's picture, or their initials. The picture comes from Google over https only. */
export function AccountAvatar({
  account,
  alt,
  className,
}: {
  account: Account;
  /** Empty when the avatar is decorative (next to the name). */
  alt: string;
  className?: string;
}) {
  const box = cn(
    'bg-secondary text-secondary-foreground grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-medium',
    className,
  );
  if (account.avatarUrl) {
    return (
      <span className={box}>
        {/* A Google profile picture on another host: next/image would need that host allow-listed. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={account.avatarUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      className={box}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {initials(account)}
    </span>
  );
}
