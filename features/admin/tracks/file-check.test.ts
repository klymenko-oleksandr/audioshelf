import { describe, expect, it } from 'vitest';
import { checkAudioFile, MAX_UPLOAD_BYTES } from './file-check';

const MB = 1024 * 1024;

describe('checkAudioFile', () => {
  it('accepts an MP3', () => {
    expect(checkAudioFile({ name: 'Part 1.mp3', type: 'audio/mpeg', size: 10 * MB })).toEqual({
      ok: true,
      ext: 'mp3',
      mimeType: 'audio/mpeg',
    });
  });

  it('accepts an M4A, whatever case the name is in and whichever type the browser reports', () => {
    for (const type of ['audio/mp4', 'audio/x-m4a', 'audio/m4a', '']) {
      expect(checkAudioFile({ name: 'PART.M4A', type, size: MB })).toEqual({
        ok: true,
        ext: 'm4a',
        mimeType: 'audio/mp4',
      });
    }
  });

  it('accepts an MP3 whose type the browser leaves empty', () => {
    expect(checkAudioFile({ name: 'a.mp3', type: '', size: MB }).ok).toBe(true);
  });

  it('refuses other audio formats and says which one it saw', () => {
    const result = checkAudioFile({ name: 'a.wav', type: 'audio/wav', size: MB });
    expect(result).toEqual({
      ok: false,
      reason: 'Only MP3 and M4A files can be uploaded. This one is .wav.',
    });
    expect(checkAudioFile({ name: 'a.flac', type: '', size: MB }).ok).toBe(false);
    expect(checkAudioFile({ name: 'a.ogg', type: 'audio/ogg', size: MB }).ok).toBe(false);
  });

  it('refuses a file with no extension, and video or text files renamed to .mp3', () => {
    expect(checkAudioFile({ name: 'audio', type: 'audio/mpeg', size: MB })).toMatchObject({
      ok: false,
      reason: 'Only MP3 and M4A files can be uploaded. This file has no extension.',
    });
    expect(checkAudioFile({ name: 'a.mp3', type: 'video/mp4', size: MB })).toMatchObject({
      ok: false,
      reason: 'This file says it is video/mp4, which does not match .mp3.',
    });
    expect(checkAudioFile({ name: 'notes.mp3', type: 'text/plain', size: MB }).ok).toBe(false);
  });

  it('refuses an empty file', () => {
    expect(checkAudioFile({ name: 'a.mp3', type: 'audio/mpeg', size: 0 })).toEqual({
      ok: false,
      reason: 'The file is empty.',
    });
  });

  it('takes files up to 500 MB (sent in parts above 100 MB) and refuses anything larger, naming the limit', () => {
    expect(MAX_UPLOAD_BYTES).toBe(500 * MB);
    expect(checkAudioFile({ name: 'a.mp3', type: '', size: 100 * MB + 1 }).ok).toBe(true);
    expect(checkAudioFile({ name: 'a.mp3', type: '', size: MAX_UPLOAD_BYTES }).ok).toBe(true);
    expect(checkAudioFile({ name: 'a.mp3', type: '', size: MAX_UPLOAD_BYTES + 1 })).toEqual({
      ok: false,
      reason: 'The file is larger than the 500 MB limit. Split it into parts.',
    });
  });
});
