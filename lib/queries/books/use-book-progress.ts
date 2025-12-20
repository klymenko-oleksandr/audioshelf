import { useQuery } from '@tanstack/react-query';
import { API_PATHS } from '@/lib/api-paths';
import { getSessionId } from '@/lib/session';
import { BookProgress } from '@/lib/types';

export function useBookProgress(bookId: string | undefined) {
  const sessionId = getSessionId();

  return useQuery({
    queryKey: ['book-progress', bookId, sessionId],
    queryFn: async () => {
      if (!bookId || !sessionId) return null;

      const res = await fetch(`${API_PATHS.books.progress(bookId)}?sessionId=${sessionId}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch progress');
      }

      const data: BookProgress = await res.json();
      return data;
    },
    enabled: !!bookId && !!sessionId,
    staleTime: 0,
  });
}
