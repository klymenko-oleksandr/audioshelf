export type TrackStatus = 'uploading' | 'processing' | 'ready' | 'failed';

const NEXT: Record<TrackStatus, TrackStatus[]> = {
  uploading: ['processing', 'failed'],
  processing: ['ready', 'failed'],
  ready: [],
  failed: ['uploading'], // retry
};

/** The track life cycle (ADR 3). A step is only taken from the state that allows it. */
export const canTransition = (from: TrackStatus, to: TrackStatus) => NEXT[from].includes(to);
