'use client';

import { RiArrowDownSLine, RiCheckLine, RiSortDesc } from '@remixicon/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
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
import { cn } from '@/lib/utils';
import { libraryHref, sortsFor, type LibrarySort, type LibraryTab } from '../view/tabs';

/**
 * The sort of the open tab (canvas: Library has a "Recently played" button, MLibrary an icon
 * that opens a sheet). The choice lives in the URL; replacing keeps Back working.
 */
export function SortControl({ tab, sort }: { tab: LibraryTab; sort: LibrarySort }) {
  const t = useTranslations('pages.library.sort');
  const router = useRouter();
  // The sort the sheet was opened with: when the URL changes the sort, the sheet is done.
  // (Closing it in the same tick as `replace` would let its Back-entry cleanup undo the URL.)
  const [openedAt, setOpenedAt] = useState<LibrarySort | null>(null);
  const open = openedAt === sort;
  const choose = (value: string) =>
    router.replace(libraryHref(tab, value as LibrarySort), { scroll: false });
  const options = sortsFor(tab);
  const current = t(`options.${sort}`);

  return (
    <>
      <div className="hidden md:block">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" />}
            aria-label={t('label', { value: current })}
            className="h-8 shrink-0"
          >
            {current}
            <RiArrowDownSLine aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t('heading')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sort} onValueChange={choose}>
                {options.map((option) => (
                  <DropdownMenuRadioItem key={option} value={option} closeOnClick>
                    {t(`options.${option}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="size-11 md:hidden"
        aria-label={t('label', { value: current })}
        onClick={() => setOpenedAt(sort)}
      >
        <RiSortDesc aria-hidden />
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={(next) => setOpenedAt(next ? sort : null)}
        title={t('heading')}
      >
        <ul className="flex flex-col">
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                aria-pressed={option === sort}
                onClick={() => {
                  if (option === sort) setOpenedAt(null);
                  else choose(option);
                }}
                className={cn(
                  'flex min-h-12 w-full items-center justify-between rounded-lg px-1 text-left',
                  option === sort && 'font-semibold',
                )}
              >
                {t(`options.${option}`)}
                {option === sort ? <RiCheckLine aria-hidden size={18} /> : null}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
