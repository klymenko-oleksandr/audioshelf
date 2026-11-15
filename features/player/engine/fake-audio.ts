import type { AudioLike } from './audio-engine';

/**
 * A scriptable stand-in for HTMLAudioElement, for engine tests.
 * It does nothing on its own: tests decide when metadata arrives, when playback starts,
 * how time advances and what fails — like a network they fully control.
 */
export class FakeAudio implements AudioLike {
  src = '';
  currentTime = 0;
  playbackRate = 1;
  volume = 1;
  preload = '';
  paused = true;
  ended = false;
  readyState = 0;

  /** Every `src` that was loaded, in order. */
  readonly loads: string[] = [];
  playCalls = 0;
  /** Set to make the next play() reject with an error of this name. */
  rejectPlayWith: string | null = null;

  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  load(): void {
    this.loads.push(this.src);
    this.readyState = 0;
    this.currentTime = 0;
    this.ended = false;
    this.paused = true;
  }

  play(): Promise<void> {
    this.playCalls++;
    if (this.rejectPlayWith) {
      const error = Object.assign(new Error(this.rejectPlayWith), { name: this.rejectPlayWith });
      this.rejectPlayWith = null;
      return Promise.reject(error);
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  // ── What the "network" and the "speakers" do ─────────────────────────────────

  emit(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  /** Metadata arrived, then enough data to play: the element starts producing sound. */
  becomeReady(): void {
    this.readyState = 1;
    this.emit('loadedmetadata');
    this.readyState = 4;
    if (!this.paused) this.emit('playing');
  }

  /** Playback moves to `time` seconds into the current track. */
  advanceTo(time: number): void {
    this.currentTime = time;
    this.emit('timeupdate');
  }

  stall(): void {
    this.readyState = 2;
    this.emit('waiting');
  }

  recover(): void {
    this.readyState = 4;
    this.emit('playing');
  }

  finishTrack(): void {
    this.ended = true;
    this.paused = true;
    this.emit('ended');
  }

  fail(): void {
    this.emit('error');
  }

  /** The OS or another app paused the element behind the app's back. */
  pauseExternally(): void {
    this.paused = true;
    this.emit('pause');
  }
}
