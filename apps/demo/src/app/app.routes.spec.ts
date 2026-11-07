// @vitest-environment jsdom
import {
  mountCraftComponent,
  provideCraftRouteLoadErrorComponent,
} from '@craft-ts/component';
import {
  CraftTestBed,
  LocalStoragePersister,
  SERVICE_RUNTIME_OVERRIDES,
  SessionStorageService,
  createRouteLoadError,
  provideCraftRouter,
  setActiveCraftRouteLoadError,
  ɵEnvironmentInjector as EnvironmentInjector,
  provideGlobalPersisterHandlerService,
  provideLocalStoragePersister,
  provideSessionStoragePersister,
  provideStoragePersister,
  provideStorageService,
  ɵInjector as Injector,
  ɵinjectCraftRouteActivationTracker,
  ɵinjectCraftRouterRuntime,
  ɵrunInInjectionContext,
} from '@craft-ts/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { demoRoutes } from './app.routes';
import { MyRouteLoadErrorScreen } from './my-route-load-error-screen';

/**
 * Every page of the demo, opened through its router as a visitor would: the
 * shell, the real route table and the storage the app config provides. Each
 * test proves its route by the activation the router reports for it.
 */
describe('demo pages', () => {
  let mounted: { destroy(): void } | undefined;

  afterEach(() => {
    mounted?.destroy();
    mounted = undefined;
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  /**
   * Mounts the app, opens `url` and resolves with the routes it activated,
   * named `<collection>:<path>` as the behaviour catalog names them, once
   * `route` is among them.
   */
  async function open(
    url: string,
    route: string,
    overrides: ReadonlyMap<string, unknown> = new Map(),
  ): Promise<DemoPage> {
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
    CraftTestBed.configureTestingModule({
      providers: [
        provideCraftRouteLoadErrorComponent(MyRouteLoadErrorScreen),
        provideGlobalPersisterHandlerService(),
        provideLocalStoragePersister(),
        provideSessionStoragePersister(),
        provideStoragePersister(function* () {
          return yield* LocalStoragePersister();
        }),
        provideStorageService(function* () {
          return yield* SessionStorageService();
        }),
        provideCraftRouter(demoRoutes.toRoutes()),
        {
          provide: SERVICE_RUNTIME_OVERRIDES,
          useValue: new Map(
            [...overrides].map(([name, value]) => [
              name,
              { kind: 'useValue', value },
            ]),
          ),
        },
      ],
    });
    const injector = CraftTestBed.inject(Injector);
    const activated: string[] = [];
    const urls: string[] = [];
    ɵrunInInjectionContext(injector, () =>
      ɵinjectCraftRouteActivationTracker(),
    ).subscribe((event) => {
      if (event.outcome !== 'activated') return;
      activated.push(`${event.routeCollection ?? ''}:${event.routePath}`);
      urls.push(event.url);
    });
    const element = document.createElement('div');
    document.body.append(element);
    mounted = mountCraftComponent(App, element, injector);
    CraftTestBed.tick();
    const runtime = ɵrunInInjectionContext(injector, () =>
      ɵinjectCraftRouterRuntime(),
    );
    if (!runtime) throw new Error('Craft router was not provided');
    void runtime.navigateByUrl(`/${url}`);
    CraftTestBed.tick();
    await vi.waitFor(() => expect(activated).toContain(route), {
      timeout: 10_000,
    });
    return { activated, urls, element };
  }

  type DemoPage = Readonly<{
    /** `<collection>:<path>` of each route activated, in order. */
    activated: readonly string[];
    /** The URL of each activation, in the same order. */
    urls: readonly string[];
    element: HTMLElement;
  }>;

  /** Clicks the control a template named `name`, once it is rendered. */
  async function click(element: HTMLElement, name: string): Promise<void> {
    const control = await vi.waitFor(() => {
      const found = element.querySelector<HTMLElement>(
        `[data-craft-name="${name}"]`,
      );
      expect(found).not.toBeNull();
      return found!;
    });
    control.click();
    CraftTestBed.tick();
  }

  const showsText = (element: HTMLElement, text: string) =>
    vi.waitFor(() => expect(element.textContent).toContain(text), {
      timeout: 10_000,
    });

  it.each([
    ['', 'demo:'],
    ['query/1', 'demo:query/:userId'],
    ['mutation/1', 'demo:mutation/:userId'],
    ['debounced-web-search', 'demo:debounced-web-search'],
    ['i18n', 'demo:i18n'],
    ['design-system', 'demo:design-system'],
    ['design-system/scroll', 'demo:design-system/scroll'],
    ['herbier', 'demo:herbier'],
    ['component-composition', 'demo:component-composition'],
    ['content-projection', 'demo:content-projection'],
    ['pixel-art', 'demo:pixel-art'],
    ['pending-node', 'demo:pending-node'],
    ['pending-node/exception', 'demo:pending-node/exception'],
    ['css-vars', 'demo:css-vars'],
    ['css-vars/required', 'demo:css-vars/required'],
    ['css-vars/inheritance', 'demo:css-vars/inheritance'],
    ['css-vars/forwarding', 'demo:css-vars/forwarding'],
    ['css-vars/property', 'demo:css-vars/property'],
    ['list-with-pagination', 'demo:list-with-pagination'],
    ['granular-mutation', 'demo:granular-mutation'],
    ['full-demo', 'demo:full-demo'],
    ['pixel-art-matrix', 'demo:pixel-art-matrix'],
    ['exceptions', 'demo:exceptions'],
    ['exception-query-params', 'demo:exception-query-params'],
    ['state-machine-list', 'demo:state-machine-list'],
    ['replay-methods', 'demo:replay-methods'],
    ['temporal-stream-replay', 'demo:temporal-stream-replay'],
    ['state-machine', 'demo:state-machine'],
    ['state-machine-text', 'demo:state-machine-text'],
    ['login-form', 'demo:login-form'],
    ['craft-service/counter', 'demo:craft-service/counter'],
    ['craft-service/register-for', 'demo:craft-service/register-for'],
    ['craft-service/user-detail', 'demo:craft-service/user-detail'],
    ['demo-send-context', 'demo:demo-send-context'],
    ['playground', 'demo:playground'],
    ['interaction-replay', 'demo:interaction-replay'],
    ['query-params', 'demo:query-params'],
    ['view-transitions', 'viewTransitions:'],
    ['view-transitions/aurora', 'viewTransitions::photoId'],
    ['slow-page', 'slowPage:'],
  ])('opens /%s', async (url, route) => {
    expect((await open(url, route)).activated).toContain(route);
  });

  it('opens a team member inside the lazy team layout', async () => {
    const { activated } = await open(
      'craft/lazy-layout/core/users/1',
      'lazyLayout:users/:userId',
    );
    expect(activated).toEqual(
      expect.arrayContaining([
        'demo:craft/lazy-layout/:teamId',
        'lazyLayout:users/:userId',
      ]),
    );
  });

  it('opens the guarded page for a signed-in user', async () => {
    const auth = {
      auth: {
        *value() {
          return { name: 'Ada' };
        },
      },
    };
    const { activated } = await open(
      'guard-demo',
      'demo:guard-demo',
      new Map([['Auth', auth]]),
    );
    expect(activated).toContain('demo:guard-demo');
  });

  it('loads the teams, then reloads them behind the pending boundary', async () => {
    const { element } = await open('pending-node', 'demo:pending-node');
    await showsText(element, '3 people');
    await click(element, 'reload');
    await showsText(element, 'Loading teams…');
    await showsText(element, '3 people');
    expect(element.textContent).toContain('Analytics · Compilers · Trajectories');
  });

  it('moves to the next user', async () => {
    const page = await open('query/1', 'demo:query/:userId');
    await click(page.element, 'GoToNextUser');
    await vi.waitFor(() => expect(page.urls).toContain('/query/2'));
  });

  it('sends Chloe a heartbeat', async () => {
    const { element } = await open(
      'temporal-stream-replay',
      'demo:temporal-stream-replay',
    );
    await click(element, 'chloeHeartbeat');
    await showsText(element, 'heartbeat');
  });

  it('navigates with a valid, then an undecodable query parameter', async () => {
    const page = await open('exception-query-params', 'demo:exception-query-params');
    await click(page.element, 'success');
    await vi.waitFor(() =>
      expect(page.urls.some((url) => url.includes('mode=success'))).toBe(true),
    );
  });

  it('changes the page size of the list', async () => {
    const page = await open('query-params', 'demo:query-params');
    const select = await vi.waitFor(() => {
      const found = page.element.querySelector<HTMLSelectElement>(
        '[data-craft-name="pageSize"]',
      );
      expect(found).not.toBeNull();
      return found!;
    });
    select.value = '8';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    CraftTestBed.tick();
    await vi.waitFor(() =>
      expect(page.urls.some((url) => url.includes('pageSize=8'))).toBe(true),
    );
  });

  /** Types `value` into the field a template named `name`. */
  async function type(element: HTMLElement, name: string, value: string) {
    const field = await vi.waitFor(() => {
      const found = element.querySelector<HTMLInputElement>(
        `[data-craft-name="${name}"]`,
      );
      expect(found).not.toBeNull();
      return found!;
    });
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    CraftTestBed.tick();
  }

  /** The HTTP boundary: one JSON answer for every request. */
  function answerHttp(status: number, body: unknown): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('searches books once the debounce window is over', async () => {
    answerHttp(200, {
      numFound: 1,
      docs: [
        {
          key: '/works/OL893415W',
          title: 'Dune',
          author_name: ['Frank Herbert'],
          first_publish_year: 1965,
        },
      ],
    });
    const { element } = await open(
      'debounced-web-search',
      'demo:debounced-web-search',
    );
    await type(element, 'search', 'dune');
    await showsText(element, 'results for “dune');
    expect(element.textContent).toContain('Frank Herbert');
  });

  it('loads the user, whose query has business exceptions', async () => {
    const { element } = await open('exceptions', 'demo:exceptions');
    await showsText(element, 'John Doe');
    expect(element.textContent).toContain('john@doe.dev');
  });

  it('tells the users API asked for a password', async () => {
    answerHttp(400, {
      code: 'PASSWORD_REQUIRED',
      message: 'Password is required',
    });
    const { element } = await open(
      'craft/lazy-layout/core/users/1',
      'lazyLayout:users/:userId',
    );
    await showsText(element, 'Query status: exception');
  });

  it('renames a user, the row alone waiting for its mutation', async () => {
    const { element } = await open('granular-mutation', 'demo:granular-mutation');
    const before = await vi.waitFor(
      () => {
        const found = element.querySelector('[data-craft-name="UpdateUserName"]');
        expect(found).not.toBeNull();
        return found!;
      },
      { timeout: 10_000 },
    );
    (before as HTMLButtonElement).click();
    CraftTestBed.tick();
    await vi.waitFor(
      () => expect(before.textContent).toContain('Loaded'),
      { timeout: 10_000 },
    );
  }, 30_000);

  it('signs in with a valid email and password', async () => {
    const { element } = await open('login-form', 'demo:login-form');
    await type(element, 'email', 'ada@example.com');
    await type(element, 'password', 'analytical');
    const form = element.querySelector<HTMLFormElement>('[data-craft-name="login"]');
    expect(form).not.toBeNull();
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    CraftTestBed.tick();
    await showsText(element, 'Login form submitted.');
  });

  it('issues an invoice behind the pending boundary', async () => {
    const { element } = await open(
      'pending-node/exception',
      'demo:pending-node/exception',
    );
    await click(element, 'issueSuccess');
    await showsText(element, 'INV-2026-014 — 42.00 €');
  });

  it('adds, completes and deletes a todo', async () => {
    const { element } = await open('playground', 'demo:playground');
    const title = 'Write the release notes';
    await type(element, 'title', title);
    await click(element, 'add');
    await showsText(element, title);
    const item = () =>
      [...element.querySelectorAll<HTMLElement>('[data-craft-name="toggle"]')]
        .map((toggle) => toggle.parentElement!)
        .find((row) => row.textContent?.includes(title));
    item()!.querySelector<HTMLElement>('[data-craft-name="toggle"]')!.click();
    CraftTestBed.tick();
    await vi.waitFor(
      () =>
        expect(
          item()!.querySelector('[data-craft-name="toggle"]')?.textContent,
        ).toBe('✅'),
      { timeout: 10_000 },
    );
    item()!.querySelector<HTMLElement>('[data-craft-name="delete"]')!.click();
    CraftTestBed.tick();
    await vi.waitFor(() => expect(element.textContent).not.toContain(title), {
      timeout: 10_000,
    });
  }, 30_000);

  it('clears the cache, then asks to reload the page', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const { element } = await open('', 'demo:');
    await click(element, 'clearCache');
    await vi.waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Cache cleared! The page will reload.'),
    );
  });

  it('retries the page whose code failed to load', async () => {
    const page = await open('', 'demo:');
    // The router keeps the failure for the screen the app config names.
    setActiveCraftRouteLoadError(
      createRouteLoadError({
        phase: 'component',
        routePath: 'i18n',
        targetUrl: '/i18n',
        cause: new Error('chunk failed to load'),
        attempt: 2,
      }),
      CraftTestBed.inject(EnvironmentInjector),
    );
    const screen = document.createElement('div');
    document.body.append(screen);
    const mountedScreen = mountCraftComponent(
      MyRouteLoadErrorScreen,
      screen,
      CraftTestBed.inject(Injector),
    );
    CraftTestBed.tick();
    expect(screen.textContent).toContain('Failed to load component for route "i18n"');
    await click(screen, 'retry');
    await vi.waitFor(() => expect(page.activated).toContain('demo:i18n'), {
      timeout: 10_000,
    });
    mountedScreen.destroy();
  });
});
