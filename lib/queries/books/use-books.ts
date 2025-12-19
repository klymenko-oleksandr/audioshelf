import { useQuery } from '@tanstack/react-query';
import { Book } from '@/lib/types';
import { API_PATHS } from '@/lib/api-paths';

export const BOOKS_QUERY_KEY = ['books'] as const;

export function useBooks() {
  return useQuery({
    queryKey: BOOKS_QUERY_KEY,
    queryFn: async (): Promise<Book[]> => {
      const res = await fetch(API_PATHS.books.list);
      if (!res.ok) throw new Error('Failed to fetch books');
      return res.json();
    },
  });
}
