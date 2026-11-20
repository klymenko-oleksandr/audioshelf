import { revalidateTag } from 'next/cache';
import { CATALOGUE_TAG } from '@/features/catalogue/cache-tag';

/**
 * Call after every admin change that listeners can see: books, tracks, covers, categories,
 * authors, narrators. `expire: 0` drops the cached reads at once instead of serving the old
 * ones while refreshing, so a book that was just unpublished is gone on the next request.
 */
export function revalidateCatalogue(): void {
  revalidateTag(CATALOGUE_TAG, { expire: 0 });
}
