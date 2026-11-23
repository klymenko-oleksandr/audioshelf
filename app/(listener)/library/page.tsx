import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LibraryView } from '@/features/library/components/library-view';
import { parseLibrarySort, parseLibraryTab } from '@/features/library/view/tabs';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.library');
  return { title: t('title') };
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; sort?: string | string[] }>;
}) {
  const params = await searchParams;
  const tab = parseLibraryTab(params.tab);
  return <LibraryView tab={tab} sort={parseLibrarySort(tab, params.sort)} />;
}
