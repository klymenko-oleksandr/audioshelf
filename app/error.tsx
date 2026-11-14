'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { PageError } from '@/components/shell/page-error';

/**
 * Error boundary for every page (PRD: "Server error on a page → inline error with Retry;
 * the shell and player keep working"). It sits inside the root layout, so only the routed
 * content is replaced.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <PageError title={t('title')} body={t('body')} retryLabel={t('retry')} onRetry={reset} />;
}
