import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Book } from '@/lib/types';
import { ADMIN_API_PATHS } from '@/lib/api-paths';
import { BOOKS_QUERY_KEY } from '../books/use-books';

export function useAdminBooks() {
  return useQuery({
    queryKey: ['admin', ...BOOKS_QUERY_KEY],
    queryFn: async (): Promise<Book[]> => {
      const res = await fetch(ADMIN_API_PATHS.books.list);
      if (!res.ok) throw new Error('Failed to fetch books');
      return res.json();
    },
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookId: string) => {
      const res = await fetch(ADMIN_API_PATHS.books.byId(bookId), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete book');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', ...BOOKS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: BOOKS_QUERY_KEY });
    },
  });
}
