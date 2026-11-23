import { describe, expect, it } from 'vitest';
import { canTransition, type TrackStatus } from './status';

const ALL: TrackStatus[] = ['uploading', 'processing', 'ready', 'failed'];

describe('canTransition', () => {
  it('moves forward: uploading → processing → ready', () => {
    expect(canTransition('uploading', 'processing')).toBe(true);
    expect(canTransition('processing', 'ready')).toBe(true);
  });

  it('can fail from any step that is still in progress', () => {
    expect(canTransition('uploading', 'failed')).toBe(true);
    expect(canTransition('processing', 'failed')).toBe(true);
  });

  it('can start again after a failure (retry), and only then', () => {
    expect(canTransition('failed', 'uploading')).toBe(true);
    expect(canTransition('ready', 'uploading')).toBe(false);
    expect(canTransition('processing', 'uploading')).toBe(false);
  });

  it('never leaves ready, and never skips a step', () => {
    for (const to of ALL) expect(canTransition('ready', to)).toBe(false);
    expect(canTransition('uploading', 'ready')).toBe(false);
    expect(canTransition('failed', 'ready')).toBe(false);
    expect(canTransition('failed', 'processing')).toBe(false);
  });

  it('does not stay in the same state', () => {
    for (const s of ALL) expect(canTransition(s, s)).toBe(false);
  });
});
