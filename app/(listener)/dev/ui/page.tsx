import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Showcase } from './showcase';

export const metadata: Metadata = {
  title: 'UI showcase',
  robots: { index: false, follow: false },
};

/**
 * Review page for shared UI behaviours (toasts, loader timing, error boundary, splash).
 * Available locally and on preview deployments; hidden in production.
 * Copy here is English only on purpose — it is a developer tool, not product UI.
 */
export default function DevUiPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <Showcase />;
}
