import { describe, expect, it } from 'vitest';
import {
  assertBrowserStorageSnapshotRestorable,
  type BrowserStorageSnapshot,
} from './debug-session-browser-storage';

function snapshot(
  overrides: Partial<BrowserStorageSnapshot> = {},
): BrowserStorageSnapshot {
  return {
    version: 1,
    localStorage: [],
    sessionStorage: [],
    cookies: [],
    cookieStoreSupported: false,
    indexedDbSupported: true,
    indexedDb: [],
    warnings: [],
    ...overrides,
  };
}

describe('browser storage replay snapshots', () => {
  it('accepts a document.cookie fallback when browser-readable cookies were captured', () => {
    expect(() =>
      assertBrowserStorageSnapshotRestorable(
        snapshot({ warnings: ['Cookie Store API is unavailable'] }),
      ),
    ).not.toThrow();
  });

  it.each([
    'localStorage could not be read: blocked',
    'sessionStorage could not be read: blocked',
    'document.cookie could not be read: blocked',
  ])('rejects a snapshot with an unreadable storage area: %s', (warning) => {
    expect(() =>
      assertBrowserStorageSnapshotRestorable(snapshot({ warnings: [warning] })),
    ).toThrow(/snapshot is incomplete/);
  });

  it('rejects an IndexedDB snapshot when databases cannot be enumerated', () => {
    expect(() =>
      assertBrowserStorageSnapshotRestorable(
        snapshot({
          indexedDbSupported: false,
          warnings: [
            'IndexedDB database enumeration is not supported by this browser.',
          ],
        }),
      ),
    ).toThrow(/snapshot is incomplete/);
  });

  it('rejects a database that could not be captured instead of replaying it empty', () => {
    expect(() =>
      assertBrowserStorageSnapshotRestorable(
        snapshot({
          indexedDb: [
            {
              name: 'private-data',
              version: 1,
              captured: false,
              stores: [],
              error: 'blocked',
            },
          ],
          warnings: ['IndexedDB private-data could not be captured: blocked'],
        }),
      ),
    ).toThrow(/snapshot is incomplete/);
  });
});
