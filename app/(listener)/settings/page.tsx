import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PagePlaceholder } from '@/components/shell/page-placeholder';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.settings');
  return { title: t('title') };
}

export default async function SettingsPage() {
  const t = await getTranslations('pages');

  return (
    <PagePlaceholder title={t('settings.title')} note={t('comingSoon')}>
      <section className="flex flex-col gap-2 pt-2">
        <h2 className="text-label">{t('settings.language')}</h2>
        <LanguageSwitcher />
      </section>
    </PagePlaceholder>
  );
}
