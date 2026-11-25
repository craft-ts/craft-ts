import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserCrypto } from './browser-boundaries';
import { createBrowserPlatform } from './craft-platform';
import { craftExpose } from './craft-primitive-gen';
import { ɵcraftRandomUUID } from './craft-random-runtime';
import { craftService } from './craft-service';
import { craftUse } from './craft-use';
import { provideCraftDevTools } from './dev-tools';
import { APP_INITIALIZER } from './host/craft-compat';
import { CraftTestBed } from './host/craft-test-bed';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Browsers only expose crypto.randomUUID() in a secure context. A page served
// over plain HTTP from a LAN address (`vite --host`) still has
// crypto.getRandomValues(), and Craft must keep working there.
describe('random UUIDs outside a secure context', () => {
  const randomUUID = Object.getOwnPropertyDescriptor(
    globalThis.crypto,
    'randomUUID',
  );

  beforeEach(() => {
    CraftTestBed.resetTestingModule();
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    globalThis.sessionStorage.clear();
  });

  afterEach(() => {
    CraftTestBed.resetTestingModule();
    if (randomUUID) {
      Object.defineProperty(globalThis.crypto, 'randomUUID', randomUUID);
    } else {
      delete (globalThis.crypto as { randomUUID?: unknown }).randomUUID;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds a version 4 UUID from getRandomValues', () => {
    expect(globalThis.crypto.randomUUID).toBeUndefined();
    const getRandomValues = vi.spyOn(globalThis.crypto, 'getRandomValues');

    const first = ɵcraftRandomUUID();

    expect(first).toMatch(UUID_V4);
    expect(ɵcraftRandomUUID()).not.toBe(first);
    expect(getRandomValues).toHaveBeenCalledTimes(2);
  });

  it('uses randomUUID when the given crypto has it', () => {
    const cryptoApi = {
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000' as const,
      getRandomValues: () => {
        throw new Error('not expected');
      },
    };

    expect(ɵcraftRandomUUID(cryptoApi)).toBe(
      '123e4567-e89b-42d3-a456-426614174000',
    );
  });

  it('reads getRandomValues from the given crypto, as a method', () => {
    const cryptoApi = {
      getRandomValues<T extends ArrayBufferView | null>(
        this: unknown,
        array: T,
      ) {
        // Web Crypto methods throw "Illegal invocation" when detached.
        expect(this).toBe(cryptoApi);
        if (array instanceof Uint8Array) array.fill(0xff);
        return array;
      },
    };

    expect(ɵcraftRandomUUID(cryptoApi)).toBe(
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
    );
  });

  it('gives an id from the browser platform', () => {
    const platform = createBrowserPlatform(window);

    expect(platform.randomUUID()).toMatch(UUID_V4);
  });

  it('gives an id from the BrowserCrypto boundary', () => {
    const { BrowserIds } = craftService(
      { name: 'BrowserIds', providedIn: 'global' },
      function* () {
        yield* craftExpose('uuid', yield* BrowserCrypto.randomUUID());
      },
    );

    CraftTestBed.runInInjectionContext(() => {
      expect(craftUse(BrowserIds()).uuid).toMatch(UUID_V4);
    });
  });

  it('starts the provideCraftDevTools() page bridge with a client id', () => {
    const sockets: string[] = [];
    vi.stubGlobal(
      'WebSocket',
      class {
        static readonly OPEN = 1;
        readonly readyState = 0;
        constructor(url: string) {
          sockets.push(url);
        }
        addEventListener(): void {
          // The test never opens the socket.
        }
        send(): void {
          // Nothing is sent before the socket opens.
        }
        close(): void {
          // Nothing to close.
        }
      },
    );
    CraftTestBed.configureTestingModule({
      providers: [...provideCraftDevTools()],
    });

    // What bootstrapCraft runs before mounting the root component.
    for (const initializer of CraftTestBed.inject(APP_INITIALIZER, []) ?? []) {
      CraftTestBed.runInInjectionContext(initializer as () => unknown);
    }

    expect(sockets).toEqual(['ws://127.0.0.1:3333']);
    expect(
      globalThis.sessionStorage.getItem('craft-ts.dev-tools.client-id'),
    ).toMatch(UUID_V4);
  });
});
