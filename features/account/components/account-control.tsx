'use client';

import { RiGoogleFill } from '@remixicon/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { useAccount } from '../use-account';
import { AccountAvatar } from './avatar';

/**
 * The top-bar end: "Sign in" for a guest, the listener's avatar (to Settings) once signed in.
 * While we don't know yet it keeps the room but stays invisible, so neither one flashes.
 */
export function AccountControl() {
  const t = useTranslations('auth');
  const account = useAccount();

  if (account.status === 'signedIn' && account.account) {
    return (
      <Link
        href="/settings"
        aria-label={t('account')}
        className="grid size-11 place-items-center rounded-full md:size-10"
      >
        <AccountAvatar account={account.account} alt={t('avatarAlt')} />
      </Link>
    );
  }

  const hidden = account.status === 'loading';
  // Without sign-in configured the link would lead nowhere useful.
  if (!hidden && !account.available) return null;

  return (
    <Link
      href="/signin"
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className={buttonVariants({ className: hidden ? 'invisible px-3' : 'px-3' })}
    >
      <RiGoogleFill size={16} aria-hidden className="hidden md:block" />
      {t('signIn')}
    </Link>
  );
}
