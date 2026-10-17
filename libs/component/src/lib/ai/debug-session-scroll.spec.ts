import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSendContextSession } from '@craft-ts/core';
import { connectDebugSessionScrollCapture } from './debug-session-scroll';

describe('debug session scroll capture', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('records standalone viewport and element scroll positions', () => {
    document.body.innerHTML =
      '<div id="scroller"><div style="height: 1000px"></div></div>';
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionScrollCapture(session);
    const scroller = document.querySelector<HTMLElement>('#scroller')!;
    scroller.scrollTop = 145;
    scroller.dispatchEvent(new Event('scroll'));
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 280,
    });
    window.dispatchEvent(new Event('scroll'));

    expect(session.events).toMatchObject([
      {
        kind: 'scroll',
        phase: 'emitted',
        payload: {
          target: 'element',
          selector: '#scroller',
          scrollLeft: 0,
          scrollTop: 145,
        },
      },
      {
        kind: 'scroll',
        payload: { target: 'viewport', scrollX: 0, scrollY: 280 },
      },
    ]);

    stopCapture();
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
    });
  });

  it('coalesces rapid scroll events into bounded position samples', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="scroller"></div>';
    const session = createSendContextSession();
    session.startRecord();
    const stopCapture = connectDebugSessionScrollCapture(session);
    const scroller = document.querySelector<HTMLElement>('#scroller')!;

    scroller.scrollTop = 100;
    scroller.dispatchEvent(new Event('scroll'));
    scroller.scrollTop = 150;
    scroller.dispatchEvent(new Event('scroll'));

    expect(session.events).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(50);

    expect(session.events).toHaveLength(2);
    expect(session.events[1]?.payload).toMatchObject({ scrollTop: 150 });
    stopCapture();
  });
});
