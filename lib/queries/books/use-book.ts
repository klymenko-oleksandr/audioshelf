import { useQuery } from '@tanstack/react-query';
import { Book } from '@/lib/types';
import { API_PATHS } from '@/lib/api-paths';

export const bookQueryKey = (id: string) => ['books', id] as const;

export function useBook(id: string) {
  return useQuery({
    queryKey: bookQueryKey(id),
    queryFn: async (): Promise<Book> => {
      const res = await fetch(API_PATHS.books.byId(id));
      if (!res.ok) {
        if (res.status === 404) throw new Error('Book not found');
        throw new Error('Failed to fetch book');
      }
      return res.json();
    },
    enabled: !!id,
  });
}
