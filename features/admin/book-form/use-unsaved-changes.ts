'use client';

import { useEffect } from 'react';

/**
 * Unsaved-changes protection for the book form. While `dirty`:
 * - closing, reloading or leaving the site asks the browser to confirm (`beforeunload`);
 * - following a link inside the panel (sidebar, breadcrumb, "Books") asks first, and stays on
 *   the page when the admin says no.
 *
 * Links that do not leave the page (new tab, `#anchor`, Ctrl/Cmd-click) are left alone. The
 * browser's own Back button cannot be intercepted reliably in the App Router; it is covered
 * only for reload and close.
 */
export function useUnsavedChangesGuard(dirty: boolean, message: string): void {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need a value to show their prompt.
      event.returnValue = '';
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== '_self') return;
      if (link.hasAttribute('download')) return;

      const href = link.getAttribute('href') ?? '';
      if (href.startsWith('#')) return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash !== ''
      )
        return;

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    // Capture phase, so the router's own click handler never sees a click the admin cancelled.
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, message]);
}
