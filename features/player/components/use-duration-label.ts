'use client';

import { useTranslations } from 'next-intl';
import { splitDuration } from '../core';

/** "10 h 24 m" / "47 m" in the current language, rounded to the minute. */
export function useDurationLabel(): (seconds: number) => string {
  const t = useTranslations('common');
  return (seconds) => {
    const { hours, minutes } = splitDuration(seconds);
    return hours > 0 ? t('durationHm', { hours, minutes }) : t('durationM', { minutes });
  };
}
