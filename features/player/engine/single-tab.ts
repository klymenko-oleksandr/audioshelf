/**
 * Only one tab plays at a time (PRD): starting playback in one tab pauses the others.
 * Tabs announce themselves on a BroadcastChannel; whoever hears someone else pauses.
 */
export function createSingleTab(onOtherTabPlays: () => void): {
  announce: () => void;
  dispose: () => void;
} {
  if (typeof BroadcastChannel === 'undefined') return { announce: () => {}, dispose: () => {} };

  const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const channel = new BroadcastChannel('audioshelf-player');
  channel.onmessage = (event: MessageEvent<{ type?: string; tabId?: string }>) => {
    if (event.data?.type === 'playing' && event.data.tabId !== tabId) onOtherTabPlays();
  };

  return {
    announce: () => channel.postMessage({ type: 'playing', tabId }),
    dispose: () => channel.close(),
  };
}
