export interface Chapter {
  id: string;
  title: string;
  order: number;
  duration: number;
  mimeType: string;
}

export interface BookProgress {
  currentChapterId: string | null;
  position: number;
  completed: boolean;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  totalDuration: number;
  createdAt: string;
  chapters: Chapter[];
  progress?: BookProgress;
}
