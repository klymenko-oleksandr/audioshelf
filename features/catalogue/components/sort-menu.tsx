'use client';

import { RiArrowDownSLine } from '@remixicon/react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BOOK_SORTS, parseBookSort, sortHref, type BookSort } from '../sort';

/**
 * The sort button of a book list (canvas: Category, Author). The choice lives in the URL
 * (`?sort=`), so the server renders the sorted list and the link can be shared.
 */
export function SortMenu({ sort }: { sort: BookSort }) {
  const t = useTranslations('catalogue.sort');
  const pathname = usePathname();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" />}
        aria-label={t('label', { value: t(`options.${sort}`) })}
        className="h-8 shrink-0"
      >
        {t(`options.${sort}`)}
        <RiArrowDownSLine aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('heading')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(value: string) =>
              // Replace, not push: changing the order should not add a Back step.
              router.replace(sortHref(pathname, parseBookSort(value)), { scroll: false })
            }
          >
            {BOOK_SORTS.map((option) => (
              <DropdownMenuRadioItem key={option} value={option} closeOnClick>
                {t(`options.${option}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
