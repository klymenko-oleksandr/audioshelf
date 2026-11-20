'use client';

import { RiShareForwardLine } from '@remixicon/react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useShare } from '@/features/share/share';

/** The author page's Share button (canvas: Author): shares the link to the page. */
export function AuthorShare({ name, slug }: { name: string; slug: string }) {
  const t = useTranslations('bookCard');
  const share = useShare();
  return (
    <Button
      variant="outline"
      className="mt-1 self-center md:self-start"
      onClick={() => share({ title: name, path: `/author/${slug}` })}
    >
      <RiShareForwardLine aria-hidden />
      {t('share')}
    </Button>
  );
}
