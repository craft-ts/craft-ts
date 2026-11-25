// @vitest-environment jsdom
import {
  craftAppConfig,
  provideCraftDevTools,
  SERVICE_RUNTIME_OVERRIDES,
} from '@craft-ts/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapCraft, type CraftAppRef } from './bootstrap';
import { craftComponent } from './component';
import { provideCraftRootComponent } from './craft-host-tokens';
import { p } from './hyperscript';

describe('bootstrapCraft', () => {
  let app: CraftAppRef | undefined;
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));

  beforeEach(() => {
    document.body.innerHTML = '<craft-root></craft-root>';
    // The development tools keep their client id per tab: start each app
    // without one so it is created again.
    sessionStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    // The MCP page bridge stays inert without a WebSocket.
    vi.stubGlobal('WebSocket', undefined);
  });

  afterEach(() => {
    app?.destroy();
    app = undefined;
    fetchMock.mockClear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('mounts the root component with the development tools (issue #41)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const App = craftComponent('BootstrapDevToolsApp', {}, () => p('ready'));

    app = bootstrapCraft({
      config: craftAppConfig({
        providers: [
          ...provideCraftDevTools({ logServerUrl: 'http://127.0.0.1:9999/logs' }),
          provideCraftRootComponent(App),
        ],
      }),
    });

    expect(document.body.textContent).toContain('ready');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('mounts with the development tools where crypto.randomUUID is absent (issues #41, #42)', () => {
    // Plain HTTP on a LAN address is not a secure context: browsers expose
    // getRandomValues there, but not randomUUID.
    const secureCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: secureCrypto.getRandomValues.bind(secureCrypto),
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const App = craftComponent('BootstrapInsecureContextApp', {}, () =>
      p('ready'),
    );

    app = bootstrapCraft({
      config: craftAppConfig({
        providers: [
          ...provideCraftDevTools({ logServerUrl: 'http://127.0.0.1:9999/logs' }),
          provideCraftRootComponent(App),
        ],
      }),
    });

    expect(document.body.textContent).toContain('ready');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('forwards the logs to the configured log server URL', () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const App = craftComponent('BootstrapLogForwardingApp', {}, () =>
        p('ready'),
      );
      app = bootstrapCraft({
        config: craftAppConfig({
          providers: [
            ...provideCraftDevTools({ logServerUrl: 'http://127.0.0.1:9999/logs' }),
            provideCraftRootComponent(App),
          ],
        }),
      });
      const overrides = app.injector.get(SERVICE_RUNTIME_OVERRIDES) as ReadonlyMap<string, { value: { log(...args: unknown[]): void } }>;
      overrides.get('ConsoleService')?.value.log('hello');

      vi.advanceTimersByTime(1000);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:9999/logs',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports the error a provider raised while the root component was injected', () => {
    const failure = new Error('root component factory failed');

    let thrown: unknown;
    try {
      app = bootstrapCraft({
        config: craftAppConfig({
          providers: [
            provideCraftRootComponent(() => {
              throw failure;
            }),
          ],
        }),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const reported = thrown as Error;
    expect(
      reported === failure || reported.cause === failure,
    ).toBe(true);
    expect(reported.message).toContain('root component factory failed');
    expect(reported.message).not.toContain('found no root component');
  });

  it('still says so when no root component is provided', () => {
    expect(() =>
      bootstrapCraft({ config: craftAppConfig({ providers: [] }) }),
    ).toThrow(/found no root component/);
  });
});
