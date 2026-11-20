'use client';

import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/toast';

export interface ShareTarget {
  title: string;
  /** Site-relative path, e.g. `/book/kobzar`. */
  path: string;
}

/** The absolute address of a page of this app. */
export const absoluteUrl = (path: string) => new URL(path, window.location.origin).href;

/**
 * Shares a link: the system share sheet where there is one (phones, Safari), otherwise the
 * link is copied. Closing the share sheet is not an error. `messages` come from the caller
 * because this is not a component.
 */
export async function shareLink(
  { title, path }: ShareTarget,
  messages: { copied: string; failed: string },
): Promise<void> {
  const url = absoluteUrl(path);

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // Anything else (blocked, unsupported data): fall through to copying.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    toast({ title: messages.copied });
  } catch {
    toast({ title: messages.failed, variant: 'error' });
  }
}

/** `share(target)` for components: the toasts are in the current language. */
export function useShare(): (target: ShareTarget) => void {
  const t = useTranslations('share');
  return (target) => void shareLink(target, { copied: t('copied'), failed: t('failed') });
}
