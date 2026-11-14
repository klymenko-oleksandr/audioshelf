import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PagePlaceholder } from '@/components/shell/page-placeholder';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.explore');
  return { title: t('title') };
}

export default async function ExplorePage() {
  const t = await getTranslations('pages');
  return <PagePlaceholder title={t('explore.title')} note={t('comingSoon')} />;
}
