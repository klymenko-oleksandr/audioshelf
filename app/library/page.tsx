import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PagePlaceholder } from '@/components/shell/page-placeholder';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.library');
  return { title: t('title') };
}

export default async function LibraryPage() {
  const t = await getTranslations('pages');
  return <PagePlaceholder title={t('library.title')} note={t('comingSoon')} />;
}
