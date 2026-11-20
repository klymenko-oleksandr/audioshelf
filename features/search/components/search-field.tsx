'use client';

import { RiCloseLine, RiSearchLine } from '@remixicon/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';
import { cn } from '@/lib/utils';
import { addRecent } from '../recent';
import { MAX_QUERY_LENGTH, searchHref } from '../tabs';

/** How long typing must pause before the results follow (PRD: 250 ms). */
export const SEARCH_DEBOUNCE_MS = 250;

interface SearchFieldProps {
  /**
   * `bar`: the compact field in the top bar (tablet and desktop). `page`: the 44 px field on
   * phones, on the search page. `launcher`: the same field on the phone Explore screen, which
   * only searches when submitted (typing there must not move the listener to another screen
   * and lose the keyboard).
   */
  variant: 'bar' | 'page' | 'launcher';
  placeholder: string;
  className?: string;
}

/**
 * The search field (canvas: Main header, MSearchResults, MExplore). A plain GET form, so it
 * works before the page is interactive; once it is, the results follow the typing with a
 * 250 ms pause and the query lives in the URL (`/search?q=`), so a search can be shared and
 * the back button works.
 */
export function SearchField({ variant, placeholder, className }: SearchFieldProps) {
  const t = useTranslations('search');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const showSpinner = useDelayedLoading(pending);

  const onSearchPage = pathname === '/search';
  const urlQuery = onSearchPage ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState(urlQuery);

  // The query this field last sent to the URL: what the URL says next is only news (a
  // recent search tapped, Back, a link) when it differs, and only then does it replace the text.
  const sent = useRef(urlQuery);
  useEffect(() => {
    if (urlQuery !== sent.current) {
      sent.current = urlQuery;
      setValue(urlQuery);
    }
  }, [urlQuery]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  function go(raw: string) {
    const query = raw.trim();
    sent.current = query;
    // The first search from another page is a new history entry; refining one replaces it,
    // so Back leaves the search instead of stepping through every pause in the typing.
    const navigate = onSearchPage ? router.replace : router.push;
    startTransition(() => navigate(query ? searchHref(query) : '/search'));
  }

  function onChange(next: string) {
    setValue(next);
    if (variant === 'launcher') return;
    cancel();
    // Clearing the field on the search page shows the start screen straight away.
    const delay = next.trim() ? SEARCH_DEBOUNCE_MS : 0;
    // Another page is only left once there is something to search for.
    if (!next.trim() && !onSearchPage) return;
    timer.current = setTimeout(() => go(next), delay);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    cancel();
    const query = value.trim();
    if (!query) return;
    addRecent(query);
    go(query);
    // Closes the on-screen keyboard so the results are in view.
    if (variant !== 'bar') inputRef.current?.blur();
  }

  const large = variant !== 'bar';
  return (
    <form
      action="/search"
      role="search"
      onSubmit={onSubmit}
      className={cn(
        'border-input text-muted-foreground focus-within:shadow-focus flex items-center rounded-lg border shadow-xs',
        large ? 'h-11 gap-2.5 pr-1 pl-3' : 'h-10 grow gap-2 px-3 lg:h-8 lg:rounded-md lg:px-2.5',
        className,
      )}
    >
      <RiSearchLine
        aria-hidden
        className={cn('shrink-0', large ? 'size-5' : 'size-[18px] lg:size-4')}
      />
      <input
        ref={inputRef}
        type="search"
        name="q"
        value={value}
        maxLength={MAX_QUERY_LENGTH}
        autoFocus={variant === 'page' && !urlQuery}
        autoComplete="off"
        enterKeyHint="search"
        placeholder={placeholder}
        aria-label={t('label')}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'text-foreground placeholder:text-muted-foreground min-w-0 grow bg-transparent text-[16px] outline-none focus-visible:shadow-none',
          '[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden',
          !large && 'lg:text-[13px]',
        )}
      />
      {showSpinner ? (
        <span role="status" className="grid size-6 shrink-0 place-items-center">
          <Spinner className="size-3.5 border-[1.5px]" />
          <span className="sr-only">{t('searching')}</span>
        </span>
      ) : null}
      {large && value ? (
        <button
          type="button"
          aria-label={t('clear')}
          onClick={() => {
            setValue('');
            cancel();
            if (onSearchPage) go('');
            inputRef.current?.focus();
          }}
          className="text-foreground grid size-11 shrink-0 place-items-center rounded-full"
        >
          <RiCloseLine size={20} aria-hidden />
        </button>
      ) : null}
    </form>
  );
}
