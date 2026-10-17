/** Query marker used for URL-mode replay launches. */
export const CRAFT_DEBUG_REPLAY_QUERY_PARAM = 'craft-debug-replay';

/** Same-document signal to keep active replay events out of the local archive. */
export const CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT =
  'craft-debug-replay-persistence';

export function isCraftDebugReplayLaunch(): boolean {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get(
      CRAFT_DEBUG_REPLAY_QUERY_PARAM,
    ) === '1'
  );
}

export function setCraftDebugReplayPersistencePaused(paused: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT, {
      detail: { paused },
    }),
  );
}
