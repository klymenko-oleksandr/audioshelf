'use client';

import { RiCheckLine, RiCloseLine, RiGoogleFill, RiRefreshLine } from '@remixicon/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import type { SigninError } from '../signin-error';
import { getAccountStore, useAccount } from '../use-account';

/**
 * The sign-in page (boards SignIn, MSignIn): what signing in gives, "Continue with Google" and
 * "Keep listening as a guest". `next` is already checked on the server (`safeNextPath`).
 */
export function SigninView({ next, error }: { next: string; error: SigninError | null }) {
  const t = useTranslations('signin');
  const router = useRouter();
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'failed' | 'unavailable' | null>(null);

  // Already signed in (or just came back from Google): nothing to do here.
  useEffect(() => {
    if (account.status === 'signedIn') router.replace(next);
  }, [account.status, next, router]);

  // Coming back to this page with Back after Google: the button works again.
  useEffect(() => {
    const reset = () => setBusy(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  async function start() {
    setBusy(true);
    setFailed(null);
    const result = await getAccountStore().signIn(next);
    // On success the browser is already on its way to Google.
    if (!result.ok) {
      setBusy(false);
      setFailed(result.reason);
    }
  }

  const message = failed ? t(`errors.${failed}`) : error ? t(`errors.${error}`) : null;
  const unavailable = !account.available || failed === 'unavailable';

  return (
    <div className="mx-auto flex w-full max-w-110 flex-col px-4 pt-2 pb-10 md:px-6 md:pt-10">
      <section
        aria-labelledby="signin-title"
        className="md:bg-popover md:border-border relative flex flex-col gap-6 md:gap-5 md:rounded-xl md:border md:p-7 md:shadow-lg"
      >
        <Link
          href={next}
          aria-label={t('close')}
          className="hover:bg-accent absolute -top-1 right-0 grid size-11 place-items-center rounded-full md:top-3 md:right-3 md:size-8"
        >
          <RiCloseLine size={20} aria-hidden />
        </Link>

        <span className="bg-primary text-primary-foreground grid size-14 place-items-center rounded-xl md:size-11 md:rounded-lg">
          <RiRefreshLine size={28} aria-hidden />
        </span>

        <div className="flex flex-col gap-2.5 md:gap-2">
          <h1
            id="signin-title"
            className="font-heading text-[30px] leading-[34px] font-semibold tracking-[-0.02em] md:text-2xl md:leading-[30px]"
          >
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm leading-[22px] md:text-[13px] md:leading-5">
            {t('lead')}
          </p>
        </div>

        <ul className="flex flex-col gap-3.5 text-sm leading-5 md:gap-2.5 md:text-[13px]">
          {(['resume', 'liked', 'stats'] as const).map((key) => (
            <li key={key} className="flex items-start gap-3 md:items-center md:gap-2.5">
              <RiCheckLine size={20} aria-hidden className="text-brand shrink-0" />
              {t(`benefits.${key}`)}
            </li>
          ))}
        </ul>

        {message ? (
          <p role="alert" className="text-destructive text-sm leading-5">
            {message}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={start}
            disabled={busy || unavailable || account.status === 'loading'}
            className="border-input bg-background inline-flex h-13 items-center justify-center gap-2.5 rounded-lg border text-[15px] font-medium shadow-xs transition-opacity disabled:opacity-50 md:h-10 md:text-[13px]"
          >
            {busy ? <Spinner /> : <RiGoogleFill size={20} aria-hidden />}
            {busy ? t('starting') : t('google')}
          </button>
          <Link
            href={next}
            className="text-muted-foreground flex h-12 items-center justify-center text-sm font-medium md:h-10 md:text-[13px]"
          >
            {t('guest')}
          </Link>
        </div>
      </section>
    </div>
  );
}
