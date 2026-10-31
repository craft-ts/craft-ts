import { describe, expect, it, vi } from 'vitest';
import {
  assertBrowserStorageSnapshotRestorable,
  redactBrowserStorageSnapshotForArchive,
  restoreBrowserStorageSnapshot,
  ɵrestoreWebStorage,
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
  it('redacts persisted session references and keeps their fingerprints', () => {
    const session = {};
    const token = 'a8Df7Gh2Jk4Lp6Qw9Er1Ty3Ui5Op';
    const result = redactBrowserStorageSnapshotForArchive(
      snapshot({
        localStorage: [['atelier.session.v1', JSON.stringify({ token })]],
        cookies: [{ name: 'auth_token', value: token }],
      }),
      session,
    );

    const archiveJson = JSON.stringify(result.snapshot);
    expect(archiveJson).not.toContain(token);
    expect(result.snapshot.localStorage[0]?.[1]).toContain('craft-ref:');
    expect(result.snapshot.cookies[0]?.value).toContain('craft-ref:');
    expect(result.refs).toHaveLength(2);
    expect(new Set(result.refs.map((ref) => ref.fingerprint)).size).toBe(1);
  });

  it('preserves IndexedDB schema names while redacting reference records', () => {
    const token = 'a8Df7Gh2Jk4Lp6Qw9Er1Ty3Ui5Op';
    const result = redactBrowserStorageSnapshotForArchive(
      snapshot({
        indexedDb: [
          {
            name: 'replay-storage-1792870361477',
            version: 1,
            captured: true,
            stores: [
              {
                name: 'values',
                keyPath: 'sessionToken',
                autoIncrement: false,
                indexes: [
                  {
                    name: 'by-session',
                    keyPath: 'sessionToken',
                    unique: false,
                    multiEntry: false,
                  },
                ],
                records: [{ key: 'auth', value: token }],
              },
            ],
          },
        ],
      }),
      {},
    );

    expect(result.snapshot.indexedDb[0]?.name).toBe(
      'replay-storage-1792870361477',
    );
    expect(result.snapshot.indexedDb[0]?.stores[0]?.name).toBe('values');
    expect(result.snapshot.indexedDb[0]?.stores[0]?.keyPath).toBe(
      'sessionToken',
    );
    expect(result.snapshot.indexedDb[0]?.stores[0]?.indexes[0]).toMatchObject({
      name: 'by-session',
      keyPath: 'sessionToken',
    });
    expect(JSON.stringify(result.snapshot)).not.toContain(token);
    expect(
      result.snapshot.indexedDb[0]?.stores[0]?.records[0]?.value,
    ).toBe(
      `craft-ref:${result.refs.find((ref) => ref.path.endsWith('.value'))?.fingerprint}`,
    );
  });

  it('accepts a document.cookie fallback when browser-readable cookies were captured', () => {
    expect(() =>
      assertBrowserStorageSnapshotRestorable(
        snapshot({ warnings: ['Cookie Store API is unavailable'] }),
      ),
    ).not.toThrow();
  });

  it('omits nullable cookie fields when restoring through Cookie Store', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'cookieStore');
    const originalIndexedDb = Object.getOwnPropertyDescriptor(window, 'indexedDB');
    const set = vi.fn(async (_cookie: unknown) => undefined);
    Object.defineProperty(window, 'cookieStore', {
      configurable: true,
      value: {
        getAll: async () => [],
        delete: async () => undefined,
        set,
      },
    });
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: { databases: async () => [] },
    });

    try {
      await restoreBrowserStorageSnapshot(
        snapshot({
          cookieStoreSupported: true,
          cookies: [
            {
              name: 'dashboard_locale',
              value: 'fr',
              domain: null,
              expires: null,
              path: '/',
              secure: true,
              sameSite: 'lax',
              partitioned: false,
            } as unknown as BrowserStorageSnapshot['cookies'][number],
          ],
        }),
      );
      expect(set).toHaveBeenCalledWith({
        name: 'dashboard_locale',
        value: 'fr',
        path: '/',
        secure: true,
        sameSite: 'lax',
        partitioned: false,
      });
    } finally {
      if (original) Object.defineProperty(window, 'cookieStore', original);
      else Reflect.deleteProperty(window, 'cookieStore');
      if (originalIndexedDb)
        Object.defineProperty(window, 'indexedDB', originalIndexedDb);
      else Reflect.deleteProperty(window, 'indexedDB');
    }
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
  it('restores the recorded web storage around the dev tooling keys of this tab', () => {
    sessionStorage.clear();
    sessionStorage.setItem('craft-ts.dev-tools.client-id', 'this-tab');
    sessionStorage.setItem('craft-ts.guided-resume.mode', 'true');
    sessionStorage.setItem('craft-debug-session-participant-id:http://127.0.0.1:4206', 'me');
    sessionStorage.setItem('stale', 'gone');

    ɵrestoreWebStorage(sessionStorage, [
      ['craft-ts.dev-tools.client-id', 'recorded-tab'],
      ['craft-debug-session-participant-id:http://127.0.0.1:4206', 'camille'],
      ['cart', '[1]'],
    ]);

    expect(Object.fromEntries(Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)]))).toEqual({
      'craft-ts.dev-tools.client-id': 'this-tab',
      'craft-ts.guided-resume.mode': 'true',
      'craft-debug-session-participant-id:http://127.0.0.1:4206': 'me',
      cart: '[1]',
    });
  });
});
