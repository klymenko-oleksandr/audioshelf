import { AudioPlayerAction, AudioPlayerState } from './audio-player.model';
import { createContext, Dispatch } from 'react';

export const AudioPlayerStateCtx = createContext<AudioPlayerState | null>(null);
export const AudioPlayerDispatchCtx = createContext<Dispatch<AudioPlayerAction> | null>(null);
