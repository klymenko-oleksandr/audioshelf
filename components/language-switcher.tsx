'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setLocale } from '@/i18n/actions';
import { locales, type Locale } from '@/i18n/config';

export function LanguageSwitcher() {
  const t = useTranslations('languageSwitcher');
  const current = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === current) return;
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t('label')}
      className="bg-muted inline-flex w-fit rounded-lg p-[3px]"
    >
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          disabled={isPending}
          onClick={() => choose(locale)}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:aria-pressed:bg-zinc-100 dark:aria-pressed:text-zinc-900"
        >
          {t(locale)}
        </button>
      ))}
    </div>
  );
}
