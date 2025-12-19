import { useQuery } from '@tanstack/react-query';
import { Book } from '@/lib/types';
import { ADMIN_API_PATHS } from '@/lib/api-paths';

export const adminBookQueryKey = (id: string) => ['admin', 'books', id] as const;

export function useAdminBook(id: string) {
  return useQuery({
    queryKey: adminBookQueryKey(id),
    queryFn: async (): Promise<Book> => {
      const res = await fetch(ADMIN_API_PATHS.books.byId(id));
      if (!res.ok) {
        if (res.status === 404) throw new Error('Book not found');
        throw new Error('Failed to fetch book');
      }
      return res.json();
    },
    enabled: !!id,
  });
}
