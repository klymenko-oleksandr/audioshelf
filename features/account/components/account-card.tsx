'use client';

import { RiGoogleFill } from '@remixicon/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { Card } from '@/features/settings/components/row';
import { getAccountStore, useAccount } from '../use-account';
import { AccountAvatar } from './avatar';

/** The Settings account card: a sign-in prompt for a guest, the profile and "Sign out" otherwise. */
export function AccountCard() {
  const t = useTranslations('settings.account');
  const account = useAccount();
  const [leaving, setLeaving] = useState(false);

  // Nothing to show until we know, and nothing to offer when sign-in isn't set up.
  if (account.status === 'loading') return null;
  if (account.status === 'guest' && !account.available) return null;

  if (account.status === 'guest') {
    return (
      <Card title={t('title')}>
        <div className="flex flex-col gap-3 py-3">
          <p className="text-muted-foreground text-sm">{t('guestBody')}</p>
          <Link
            href="/signin?next=%2Fsettings"
            className="border-input bg-background inline-flex h-10 items-center justify-center gap-2 rounded-md border text-[13px] font-medium shadow-xs pointer-coarse:h-11"
          >
            <RiGoogleFill size={16} aria-hidden />
            {t('signIn')}
          </Link>
        </div>
      </Card>
    );
  }

  const me = account.account!;
  return (
    <Card title={t('title')}>
      <div className="flex items-center gap-3 py-3">
        <AccountAvatar account={me} alt="" className="size-11 text-sm" />
        <div className="min-w-0 grow">
          <p className="truncate text-sm font-medium">{me.name}</p>
          <p className="text-muted-foreground truncate text-sm">{me.email}</p>
          <p className="text-muted-foreground text-xs">{t('signedInWith')}</p>
        </div>
        <button
          type="button"
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            await getAccountStore().signOut();
            setLeaving(false);
          }}
          className="border-border inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {leaving ? <Spinner /> : null}
          {leaving ? t('signingOut') : t('signOut')}
        </button>
      </div>
    </Card>
  );
}
