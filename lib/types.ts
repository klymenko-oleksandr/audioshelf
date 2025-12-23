export interface Chapter {
  id: string;
  title: string;
  order: number;
  objectKey: string; // S3 object key - @todo: verify
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
  coverThumbnailUrl?: string | null;
  coverMediumUrl?: string | null;
  coverLargeUrl?: string | null;
  coverObjectKey: string | null; // S3 object key - legacy
  totalDuration: number;
  createdAt: string;
  chapters: Chapter[];
  progress?: BookProgress;
}
