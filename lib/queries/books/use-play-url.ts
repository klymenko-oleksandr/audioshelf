import { useMutation } from '@tanstack/react-query';
import { API_PATHS } from '@/lib/api-paths';

interface PlayUrlParams {
  bookId: string;
  chapterId?: string;
}

interface PlayUrlResponse {
  playUrl: string;
  chapter: {
    id: string;
    title: string;
    order: number;
    duration: number;
  };
  totalChapters: number;
}

export function usePlayUrl() {
  return useMutation({
    mutationFn: async ({ bookId, chapterId }: PlayUrlParams) => {
      const res = await fetch(API_PATHS.books.playUrl(bookId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId }),
      });

      if (!res.ok) throw new Error('Failed to get play URL');
      
      const data: PlayUrlResponse = await res.json();
      return data;
    },
  });
}
