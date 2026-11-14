import { RiHome5Line } from '@remixicon/react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound');
  return { title: t('title') };
}

/** Unknown URL or removed book (canvas board: NotFound). Rendered inside the shell. */
export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <div className="grid grow place-items-center p-8">
      <div className="flex max-w-[460px] flex-col items-center gap-4 text-center">
        <span
          aria-hidden
          className="font-heading text-muted-foreground text-[96px] leading-none font-bold tracking-[-0.04em]"
        >
          404
        </span>
        <h1 className="font-heading text-[26px] leading-8 font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('body')}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Link
            href="/"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-[13px] font-medium shadow-xs"
          >
            <RiHome5Line size={16} aria-hidden />
            {t('home')}
          </Link>
          <Link
            href="/explore"
            className="border-input bg-background hover:bg-accent inline-flex h-9 items-center rounded-md border px-4 text-[13px] font-medium shadow-xs"
          >
            {t('explore')}
          </Link>
        </div>
      </div>
    </div>
  );
}
