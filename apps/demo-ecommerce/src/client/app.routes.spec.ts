// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import {
  CraftTestBed,
  createServerFunctionFetchTransport,
  LocalStoragePersister,
  provideCraftRouter,
  provideGlobalPersisterHandlerService,
  provideLocalStoragePersister,
  provideServerFunctionTransport,
  provideSessionStoragePersister,
  provideStoragePersister,
  provideStorageService,
  SessionStorageService,
  ɵInjector as Injector,
  ɵinjectCraftRouterRuntime,
  ɵrunInInjectionContext,
} from '@craft-ts/core';
import { afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { demoAccounts } from '../shared/accounts';
import { AppShell } from './app-shell';
import { appRoutes } from './app.routes';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

/**
 * The shop as a visitor uses it, against the real server on a store of its
 * own (pages.global-setup.ts).
 */
describe('demo e-commerce pages', () => {
  const serverUrl = inject('ecommerceServerUrl');
  let element: HTMLElement;
  let mounted: { destroy(): void };

  beforeEach(() => {
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
    CraftTestBed.configureTestingModule({
      providers: [
        // As app.config.ts provides them, without the dev tools.
        provideGlobalPersisterHandlerService(),
        provideLocalStoragePersister(),
        provideSessionStoragePersister(),
        provideStoragePersister(function* () {
          return yield* LocalStoragePersister();
        }),
        provideStorageService(function* () {
          return yield* SessionStorageService();
        }),
        provideCraftRouter(appRoutes.toRoutes()),
        provideServerFunctionTransport(
          createServerFunctionFetchTransport({ endpoint: `${serverUrl}/__server-functions` }),
        ),
      ],
    });
    element = document.createElement('div');
    document.body.append(element);
    mounted = mountCraftComponent(AppShell, element, CraftTestBed.inject(Injector));
    CraftTestBed.tick();
  });

  afterEach(() => {
    mounted.destroy();
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
  const button = (name: string) =>
    vi.waitFor(() => {
      const found = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
        (candidate) => candidate.textContent?.trim() === name && !candidate.disabled,
      );
      expect(found).toBeDefined();
      return found!;
    });

  it.each([
    ['/', 'Du bon, tout simplement.'],
    ['/produit/croissant', 'Croissant pur beurre'],
    ['/formule/pause-cafe', 'Composez votre formule'],
    ['/panier-logs', 'Un panier sous observation'],
  ])('opens %s', async (url, text) => {
    open(url);
    await shows(text);
  });

  it('shows the week’s promotion counting down, and the pastries at its price', async () => {
    open('/catalogue');
    await shows('La semaine des pâtisseries');
    await shows('−20 % sur toutes les pâtisseries');
    const countdown = () => element.querySelector('.promo-countdown')?.textContent ?? '';
    await vi.waitFor(() => expect(countdown()).toMatch(/(\d+ j )?(\d{2} h )?\d{2} min \d{2} s/));
    // One second later, the counter has moved.
    const first = countdown();
    await vi.waitFor(() => expect(countdown()).not.toBe(first), { timeout: 3_000 });
    const card = (name: string) =>
      [...element.querySelectorAll('.card')].find((candidate) => candidate.textContent?.includes(name))?.textContent ?? '';
    await vi.waitFor(() => expect(card('Croissant pur beurre')).toContain('3,00\u00a0€2,40\u00a0€'));
    expect(card('Espresso')).not.toContain('Promo');
  });

  it('signs a member of the team in, then out', async () => {
    const [account] = demoAccounts;
    open('/connexion');
    (await button(`Se connecter en tant que ${account.name}`)).click();
    CraftTestBed.tick();
    await shows(`Bonjour ${account.name} !`);

    (await button('Se déconnecter')).click();
    CraftTestBed.tick();
    await vi.waitFor(() => {
      expect(element.textContent).not.toContain(`Bonjour ${account.name} !`);
      expect(element.querySelector('h1')?.textContent).toBe('Connexion');
    });
  });
});
