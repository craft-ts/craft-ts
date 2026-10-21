import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendContextEvent } from '@craft-ts/core';
import {
  BROWSER_STORAGE_CHECKPOINT_EVENT,
  connectBrowserStorageCheckpoints,
  type BrowserStorageSnapshot,
} from './debug-session-browser-storage';

function storage(value: string): BrowserStorageSnapshot {
  return {
    version: 1,
    localStorage: [['k', value]],
    sessionStorage: [],
    cookies: [],
    cookieStoreSupported: true,
    indexedDbSupported: true,
    indexedDb: [],
    warnings: [],
  };
}

function setup(initial: string) {
  const events$ = new Subject<readonly Pick<SendContextEvent, 'kind' | 'name'>[]>();
  const capture = vi.fn();
  let current = initial;
  const captureStorage = vi.fn(async () => storage(current));
  const stop = connectBrowserStorageCheckpoints(
    { events$, capture } as never,
    { baseline: Promise.resolve(storage(initial)), capture: captureStorage },
  );
  return {
    events$,
    capture,
    captureStorage,
    stop,
    set: (value: string) => {
      current = value;
    },
  };
}

describe('connectBrowserStorageCheckpoints', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('records the storage only when it changed since the last capture', async () => {
    const { events$, capture, set, stop } = setup('a');
    events$.next([{ kind: 'dom', name: 'click' }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(capture).not.toHaveBeenCalled();

    set('b');
    events$.next([{ kind: 'dom', name: 'click' }]);
    events$.next([{ kind: 'dom', name: 'click' }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('storage', 'emitted', {
      name: BROWSER_STORAGE_CHECKPOINT_EVENT,
      payload: { snapshotJson: JSON.stringify(storage('b')) },
    });

    // Its own event neither re-arms the capture nor repeats the record.
    events$.next([{ kind: 'storage', name: BROWSER_STORAGE_CHECKPOINT_EVENT }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(capture).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops capturing once disconnected', async () => {
    const { events$, captureStorage, stop } = setup('a');
    stop();
    events$.next([{ kind: 'dom', name: 'click' }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(captureStorage).not.toHaveBeenCalled();
  });
});
