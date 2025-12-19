import { AudioPlayerAction, AudioPlayerState } from './audio-player.model';

export default function audioPlayerReducer(state: AudioPlayerState, action: AudioPlayerAction): AudioPlayerState {
  switch (action.type) {
    case 'PLAY_BOOK':
      return {
        ...state,
        currentBook: action.payload.book,
        currentChapterId: action.payload.chapterId ?? null,
        isPlaying: true,
      };
    
    case 'PLAY_CHAPTER':
      return {
        ...state,
        currentChapterId: action.payload,
        isPlaying: true,
      };
    
    case 'TOGGLE_PLAY_PAUSE':
      return {
        ...state,
        isPlaying: !state.isPlaying,
      };
    
    case 'SET_PLAYING':
      return {
        ...state,
        isPlaying: action.payload,
      };
    
    case 'CLOSE_PLAYER':
      return {
        currentBook: null,
        currentChapterId: null,
        isPlaying: false,
      };
    
    default:
      return state;
  }
}
