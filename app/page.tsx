import { getTranslations } from 'next-intl/server';
import { PagePlaceholder } from '@/components/shell/page-placeholder';

export default async function HomePage() {
  const t = await getTranslations('pages');
  return <PagePlaceholder title={t('home.title')} note={t('comingSoon')} />;
}
