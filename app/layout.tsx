import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Toaster } from '@/components/ui/toast';
import { ThemeSync } from '@/features/settings/theme-sync';
import { THEME_INIT_SCRIPT } from '@/features/settings/theme';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('description'),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    // suppressHydrationWarning: the script below sets data-theme on <html> before React runs.
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Applies a forced light/dark theme before the first paint, so there is no flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider>
          {children}
          <Toaster />
          <ThemeSync />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
