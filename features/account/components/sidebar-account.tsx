'use client';

import { RiGoogleFill } from '@remixicon/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAccount } from '../use-account';
import { AccountAvatar } from './avatar';

/**
 * The card at the bottom of the sidebar (board: Sidebar): an invitation to sign in for a guest,
 * who is signed in for everyone else. Until the account is known it keeps its room, invisibly.
 */
export function SidebarAccount() {
  const t = useTranslations('guest');
  const account = useAccount();

  if (account.status === 'signedIn' && account.account) {
    return (
      <Link
        href="/settings"
        className="border-sidebar-border bg-background hover:bg-accent flex items-center gap-3 rounded-xl border p-3"
      >
        <AccountAvatar account={account.account} alt="" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{account.account.name}</span>
          <span className="text-muted-foreground block truncate text-[12px]">
            {account.account.email}
          </span>
        </span>
      </Link>
    );
  }

  if (account.status !== 'loading' && !account.available) return null;

  const hidden = account.status === 'loading';
  return (
    <div
      aria-hidden={hidden || undefined}
      className={`border-sidebar-border bg-background flex flex-col gap-3 rounded-xl border p-4 ${hidden ? 'invisible' : ''}`}
    >
      <div className="text-card-title">{t('title')}</div>
      <p className="text-muted-foreground text-[12px] leading-[18px]">{t('body')}</p>
      <Link
        href="/signin"
        tabIndex={hidden ? -1 : undefined}
        className="border-input bg-background hover:bg-accent flex min-h-8 items-center justify-center gap-2 rounded-md border py-1 text-[12px] font-medium whitespace-nowrap shadow-xs"
      >
        <RiGoogleFill size={16} aria-hidden className="shrink-0" />
        {t('cta')}
      </Link>
    </div>
  );
}
