import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppReady } from '@/components/shell/app-ready';
import { AppShell } from '@/components/shell/app-shell';
import { Splash } from '@/components/shell/splash';
import { Toaster } from '@/components/ui/toast';
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
    <html lang={locale}>
      <body>
        <Splash />
        <NextIntlClientProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </NextIntlClientProvider>
        <AppReady />
      </body>
    </html>
  );
}
