import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';

export default async function HomePage() {
  const t = await getTranslations('home');

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">{t('tagline')}</p>
      <p className="text-sm text-zinc-500">{t('status')}</p>
      {/* Temporary: moves to Settings once the shell exists (Phase 1/5). */}
      <LanguageSwitcher />
    </main>
  );
}
