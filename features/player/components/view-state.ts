import { isWaiting, type PlayerStatus } from '../core';
import type { PlayerViewState } from './player-bar-view';

/**
 * The spinner follows the loader timing rule: nothing for the first 300 ms of waiting, then
 * at least 600 ms. Until it shows, the player keeps looking like it is playing.
 */
export function viewState(status: PlayerStatus, spinnerVisible: boolean): PlayerViewState {
  if (isWaiting(status)) return spinnerVisible ? status : 'playing';
  if (status === 'playing' && spinnerVisible) return 'buffering';
  return status;
}
