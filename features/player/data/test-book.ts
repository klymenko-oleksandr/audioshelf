import { chaptersFromTracks, type PlayerBook } from '../core';

/**
 * Three short generated tones (about 6 s, 6 s, 4 s) under /dev/audio. Used by the showcase
 * and the end-to-end tests so playback can be exercised without the network or a database.
 */
export const TEST_BOOK: PlayerBook = (() => {
  const tracks = [6.03, 6.03, 4.05].map((duration, index) => ({
    id: `test-${index + 1}`,
    url: `/dev/audio/tone-${index + 1}.mp3`,
    duration,
  }));
  return {
    id: 'test-book',
    slug: 'test-book',
    title: 'Test book',
    author: 'Three short tones',
    tracks,
    chapters: chaptersFromTracks(tracks, (index) => `Tone ${index + 1}`),
    ongoing: false,
  };
})();
