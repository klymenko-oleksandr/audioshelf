import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PagePlaceholder } from '@/components/shell/page-placeholder';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.search');
  return { title: t('title') };
}

export default async function SearchPage() {
  const t = await getTranslations('pages');
  return <PagePlaceholder title={t('search.title')} note={t('comingSoon')} />;
}
