import { useMutation } from '@tanstack/react-query';
import { API_PATHS } from '@/lib/api-paths';
import { getSessionId } from '@/lib/session';

interface SaveProgressParams {
  bookId: string;
  chapterId: string;
  position: number;
  completed?: boolean;
}

export function useSaveProgress() {
  return useMutation({
    mutationFn: async ({ bookId, chapterId, position, completed = false }: SaveProgressParams) => {
      const sessionId = getSessionId();
      if (!sessionId) throw new Error('No session ID');

      const res = await fetch(API_PATHS.books.progress(bookId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          chapterId,
          position,
          completed,
        }),
      });

      if (!res.ok) throw new Error('Failed to save progress');
    },
  });
}
