import type { SendContextSession } from '@craft-ts/core';
import { CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT } from './debug-session-replay-signals';

const VIEWPORT_SAMPLE_INTERVAL_MS = 80;

type ViewportSize = Readonly<{ width: number; height: number }>;

/** Records viewport changes as replayable steps, including orientation changes. */
export function connectDebugSessionViewportCapture(
  session: SendContextSession,
): () => void {
  let captured: ViewportSize = currentViewport();
  let latest = captured;
  let lastCapturedAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let paused = false;

  const flush = () => {
    timer = undefined;
    if (
      paused ||
      !session.activeClip ||
      (latest.width === captured.width && latest.height === captured.height)
    )
      return;
    captured = latest;
    lastCapturedAt = performance.now();
    session.capture('viewport', 'emitted', {
      name: `Viewport · ${captured.width} × ${captured.height}`,
      payload: captured,
    });
  };

  const onResize = () => {
    latest = currentViewport();
    if (latest.width === captured.width && latest.height === captured.height)
      return;
    const delay =
      VIEWPORT_SAMPLE_INTERVAL_MS - (performance.now() - lastCapturedAt);
    if (delay <= 0) {
      flush();
    } else if (timer === undefined) {
      timer = setTimeout(flush, delay);
    }
  };

  const onReplayPersistence = (event: Event) => {
    const value = (event as CustomEvent<{ paused?: unknown }>).detail?.paused;
    if (typeof value !== 'boolean') return;
    paused = value;
    if (paused) {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      latest = captured;
    }
  };

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.addEventListener(
    CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
    onReplayPersistence,
  );

  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.removeEventListener(
      CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
      onReplayPersistence,
    );
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    flush();
  };
}

function currentViewport(): ViewportSize {
  return { width: window.innerWidth, height: window.innerHeight };
}
