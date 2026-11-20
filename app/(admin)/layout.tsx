import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * The admin panel: no listener shell, no player, never indexed. `proxy.ts` also marks every
 * response private and `noindex`; this covers the page metadata as well.
 */
export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin' },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="bg-background text-foreground min-h-dvh">{children}</div>;
}
