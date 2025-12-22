import { useQuery } from '@tanstack/react-query';
import { Book } from '@/lib/types';
import { API_PATHS } from '@/lib/api-paths';

export const BOOKS_QUERY_KEY = ['books'] as const;

export function useBooks(search?: string) {
  return useQuery({
    queryKey: [...BOOKS_QUERY_KEY, search],
    queryFn: async (): Promise<Book[]> => {
      const url = search 
        ? `${API_PATHS.books.list}?search=${encodeURIComponent(search)}`
        : API_PATHS.books.list;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch books');
      return res.json();
    },
  });
}
