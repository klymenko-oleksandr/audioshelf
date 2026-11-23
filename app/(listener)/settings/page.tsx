import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SettingsView } from '@/features/settings/components/settings-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.settings');
  return { title: t('title') };
}

export default async function SettingsPage() {
  const t = await getTranslations('pages');

  return (
    <div className="flex flex-col gap-4 px-4 pt-2 pb-6 md:px-6 md:pt-5 lg:px-8 lg:pt-7">
      <h1 className="font-heading text-[26px] leading-8 font-semibold tracking-[-0.02em] md:text-[30px] md:leading-9 md:tracking-[-0.025em]">
        {t('settings.title')}
      </h1>
      <SettingsView />
    </div>
  );
}
