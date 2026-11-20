import { RiHome5Line } from '@remixicon/react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';

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
          <Link href="/" className={buttonVariants({ size: 'lg', className: 'px-4' })}>
            <RiHome5Line size={16} aria-hidden />
            {t('home')}
          </Link>
          <Link
            href="/explore"
            className={buttonVariants({ variant: 'outline', size: 'lg', className: 'px-4' })}
          >
            {t('explore')}
          </Link>
        </div>
      </div>
    </div>
  );
}
