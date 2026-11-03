// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import {
  CraftTestBed,
  createServerFunctionFetchTransport,
  provideCraftRouter,
  provideServerFunctionTransport,
  ɵInjector as Injector,
  ɵinjectCraftRouterRuntime,
  ɵrunInInjectionContext,
} from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { provideClaimedUserId } from '../shared/claimed-user-id';
import { AppShell } from './app-shell';
import { appRoutes } from './app.routes';
import {
  clientAuthenticatedUser,
  ClientCurrentUserLive,
} from './authenticated-user';

/**
 * The app as a visitor uses it: the shell, the router and the real demo
 * server behind the server-function transport. Only the endpoint differs
 * from `app.config.ts`, the page being served from nowhere.
 */
describe('demo with server function pages', () => {
  // Started by pages.global-setup.ts.
  const serverUrl = inject('demoServerUrl');
  let element: HTMLElement;
  let mounted: { destroy(): void };
  let disposeBridge: () => void;

  beforeEach(() => {
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
    disposeBridge = installCraftEffectBridge();
    CraftTestBed.configureTestingModule({
      providers: [
        provideCraftRouter(appRoutes.toRoutes()),
        provideServerFunctionTransport(
          createServerFunctionFetchTransport({
            endpoint: `${serverUrl}/__server-functions`,
          }),
        ),
        provideClaimedUserId(() => clientAuthenticatedUser.id),
        provideLayer(ClientCurrentUserLive),
      ],
    });
    element = document.createElement('div');
    document.body.append(element);
    mounted = mountCraftComponent(AppShell, element, CraftTestBed.inject(Injector));
    CraftTestBed.tick();
  });

  afterEach(() => {
    mounted.destroy();
    disposeBridge();
    CraftTestBed.resetTestingModule();
  });

  const open = (url: string) => {
    const router = ɵrunInInjectionContext(CraftTestBed.inject(Injector), () =>
      ɵinjectCraftRouterRuntime(),
    );
    if (!router) throw new Error('Craft router was not provided');
    void router.navigateByUrl(url);
    CraftTestBed.tick();
  };
  const shows = (text: string) =>
    vi.waitFor(() => expect(element.textContent).toContain(text), { timeout: 5_000 });
  const search = async (input: string, value: string) => {
    const field = await vi.waitFor(() => {
      const found = element.querySelector<HTMLInputElement>(`input[data-craft-name="${input}"]`);
      expect(found).not.toBeNull();
      return found!;
    });
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    CraftTestBed.tick();
    field.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    CraftTestBed.tick();
  };

  it('lists the public products on the home page', async () => {
    open('/');
    await shows('A public server function');
    await shows('Craft Starter');
  });

  it('searches the users an admin may list', async () => {
    open('/authenticated-list');
    await shows('Ada Lovelace');
    await search('filterInput', 'grace');
    await vi.waitFor(() => {
      expect(element.textContent).toContain('Grace Hopper');
      expect(element.textContent).not.toContain('Ada Lovelace');
    });
  });

  it('searches the public user list', async () => {
    open('/simple-list');
    await shows('Ada Lovelace');
    await search('simpleFilterInput', 'grace');
    await vi.waitFor(() => {
      expect(element.textContent).toContain('Grace Hopper');
      expect(element.textContent).not.toContain('Ada Lovelace');
    });
  });

  it('searches through the portable middleware', async () => {
    open('/portable');
    await shows('Ada Lovelace');
    await search('portableFilterInput', 'grace');
    await vi.waitFor(() => {
      expect(element.textContent).toContain('Grace Hopper');
      expect(element.textContent).not.toContain('Ada Lovelace');
    });
  });

  it('runs the Effect middleware pipeline', async () => {
    open('/effect-middleware');
    await shows('Run the pipeline');
    await search('effectMiddlewareFilterInput', 'grace');
    await shows('Grace Hopper');
  });

  it.each([
    ['/session-required', 'Authentification requise'],
    ['/session-revoked', 'Session révoquée'],
    ['/access-denied', 'Accès refusé'],
    ['/users-not-found', 'Aucun utilisateur'],
  ])('explains a refused list on %s', async (url, title) => {
    open(url);
    await shows(title);
  });
});
