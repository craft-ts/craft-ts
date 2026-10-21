import { hasReplayStorageRestoreMarker } from './debug-session-browser-storage';

/** Query marker used for URL-mode replay launches. */
export const CRAFT_DEBUG_REPLAY_QUERY_PARAM = 'craft-debug-replay';

/** Message channel shared by the dashboard and the bridge of the target app. */
export const CRAFT_DEBUG_REPLAY_CHANNEL = 'craft-debug-replay';

/**
 * Query marker of a live debug launch: the app was opened by the dashboard
 * from an app snapshot and waits for it before bootstrapping. Its value is the
 * id of the launch.
 */
export const CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM = 'craft-debug-snapshot';

/** Same-document signal to keep active replay events out of the local archive. */
export const CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT =
  'craft-debug-replay-persistence';

export function isCraftDebugReplayLaunch(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    new URLSearchParams(window.location.search).get(
      CRAFT_DEBUG_REPLAY_QUERY_PARAM,
    ) === '1' || hasReplayStorageRestoreMarker()
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
