import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag }));

describe('revalidateCatalogue', () => {
  beforeEach(() => revalidateTag.mockClear());

  it('expires the catalogue tag right away, so listeners see the change on their next load', async () => {
    const { revalidateCatalogue } = await import('./revalidate');
    revalidateCatalogue();
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('catalogue', { expire: 0 });
  });
});
