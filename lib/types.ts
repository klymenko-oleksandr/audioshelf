export interface AudioAsset {
  id: string;
  mimeType: string;
}

export interface BookProgress {
  position: number;
  duration: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  createdAt: string;
  audio: AudioAsset | null;
  progress?: BookProgress;
}
