import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSendContextSession } from '@craft-ts/core';
import { connectDebugSessionViewportCapture } from './debug-session-viewport';
import { CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT } from './debug-session-replay-signals';

describe('debug session viewport capture', () => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalHeight,
    });
  });

  it('records desktop to mobile and portrait to landscape viewport changes', async () => {
    vi.useFakeTimers();
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionViewportCapture(session);

    setViewport(390, 844);
    window.dispatchEvent(new Event('resize'));
    expect(session.events).toMatchObject([
      {
        kind: 'viewport',
        phase: 'emitted',
        payload: { width: 390, height: 844 },
      },
    ]);

    setViewport(844, 390);
    window.dispatchEvent(new Event('orientationchange'));
    await vi.advanceTimersByTimeAsync(80);

    expect(session.events).toHaveLength(2);
    expect(session.events[1]).toMatchObject({
      kind: 'viewport',
      payload: { width: 844, height: 390 },
    });
    stopCapture();
  });

  it('does not record iframe resizes caused by replay viewport steps', () => {
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionViewportCapture(session);
    window.dispatchEvent(
      new CustomEvent(CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT, {
        detail: { paused: true },
      }),
    );

    setViewport(390, 844);
    window.dispatchEvent(new Event('resize'));

    expect(session.events).toHaveLength(0);
    stopCapture();
  });
});

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  });
}
