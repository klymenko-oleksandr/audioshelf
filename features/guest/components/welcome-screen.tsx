'use client';

import { RiArrowRightLine, RiCheckLine, RiGoogleFill, RiHeadphoneLine } from '@remixicon/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { setLocale } from '@/i18n/actions';
import { locales, type Locale } from '@/i18n/config';

/** Decorative cover wall of the Welcome board: plain tiles, no titles (it is aria-hidden). */
const WALL = [
  'bg-foreground',
  'bg-primary',
  'bg-chart-3',
  'bg-chart-1',
  'bg-chart-5',
  'bg-sidebar-primary',
  'bg-chart-1',
  'bg-foreground',
  'bg-primary',
  'bg-chart-5',
  'bg-chart-3',
  'bg-sidebar-primary',
] as const;

function Language() {
  const t = useTranslations('welcome');
  const names = useTranslations('languageSwitcher');
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === current) return;
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return (
    <div role="group" aria-label={t('language')} className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">{t('language')}</span>
      <div className="flex gap-2">
        {locales.map((locale) => (
          <Button
            key={locale}
            type="button"
            lang={locale}
            variant={locale === current ? 'secondary' : 'outline'}
            aria-pressed={locale === current}
            disabled={pending}
            onClick={() => choose(locale)}
            className="h-9 px-3.5 text-[13px] pointer-coarse:h-11"
          >
            {locale === current ? <RiCheckLine size={16} aria-hidden /> : null}
            {names(locale)}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * The welcome screen (boards Welcome, MWelcome): a full-screen modal over Home. A native
 * `<dialog>` gives it a focus trap, an inert page behind it and Esc for free; Esc, Skip,
 * "Start listening" and the sign-in link all end it, and all of them count as seen.
 * Nothing underneath can start playback while it is open, and every way out is one tap.
 *
 * Not built from the boards: the mood picker (moods arrive in v1.1, nothing would use the
 * picks). "Listen in" is the interface language switcher.
 */
export function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const t = useTranslations('welcome');
  const app = useTranslations('app');
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="welcome-title"
      onCancel={(event) => {
        event.preventDefault();
        onDone();
      }}
      className="bg-background text-foreground fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none border-0 p-0 backdrop:bg-transparent"
    >
      <div className="grid h-dvh md:grid-cols-[minmax(0,1fr)_minmax(0,40%)]">
        <section className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 pt-6 pb-5 md:justify-center md:gap-7 md:px-16 md:py-16 lg:px-24">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg md:size-9">
                <RiHeadphoneLine size={20} aria-hidden />
              </span>
              <span className="font-heading text-lg font-semibold md:text-xl">{app('name')}</span>
            </span>
            <button
              type="button"
              onClick={onDone}
              className="text-muted-foreground flex min-h-11 items-center px-2 text-sm font-medium md:hidden"
            >
              {t('skip')}
            </button>
          </div>

          <div className="flex max-w-140 flex-col gap-2.5">
            <h1
              id="welcome-title"
              className="font-heading text-[32px] leading-9 font-bold tracking-[-0.03em] md:text-5xl md:leading-[52px]"
            >
              {t('title')}
            </h1>
            <p className="text-muted-foreground text-sm leading-[21px] md:text-[15px] md:leading-6">
              {t('body')}
            </p>
          </div>

          <Language />

          <div className="mt-auto flex flex-col gap-1 md:mt-0">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={onDone}
                className="h-12 grow gap-2 rounded-lg text-[15px] md:h-10 md:grow-0 md:px-5 md:text-[13px]"
              >
                {t('start')}
                <RiArrowRightLine size={20} aria-hidden />
              </Button>
              <button
                type="button"
                onClick={onDone}
                className="text-muted-foreground hidden p-2.5 text-[13px] font-medium md:block"
              >
                {t('skip')}
              </button>
            </div>
            <p className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-2 text-[13px] md:mt-3 md:justify-start md:text-xs">
              <span>{t('elsewhere')}</span>
              <Link
                href="/signin?next=%2F"
                onClick={onDone}
                className="text-foreground inline-flex min-h-11 items-center gap-1.5 font-medium underline underline-offset-[3px] md:min-h-0"
              >
                <RiGoogleFill size={12} aria-hidden className="hidden md:block" />
                {t('signIn')}
              </Link>
            </p>
          </div>
        </section>

        <aside aria-hidden="true" className="bg-muted relative hidden overflow-hidden md:block">
          <div className="absolute top-24 left-12 grid -rotate-6 grid-cols-3 gap-5">
            {WALL.map((tone, index) => (
              <div key={index} className={`${tone} size-44 rounded-xl opacity-90 lg:size-46`} />
            ))}
          </div>
        </aside>
      </div>
    </dialog>
  );
}
