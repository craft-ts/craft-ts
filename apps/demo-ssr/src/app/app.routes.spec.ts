// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import {
  CraftTestBed,
  provideCraftRouter,
  provideServerFunctionTransport,
  ɵInjector as Injector,
  ɵinjectCraftRouterRuntime,
  ɵrunInInjectionContext,
} from '@craft-ts/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { ssrRoutes } from './app.routes';

/** Each page of the lab, opened in the browser the way a visitor reaches it. */
describe('SSR lab pages', () => {
  let element: HTMLElement;
  let mounted: { destroy(): void };

  beforeEach(() => {
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
    CraftTestBed.configureTestingModule({
      providers: [
        provideCraftRouter(ssrRoutes.toRoutes()),
        // The HTTP edge: the products the overview lists.
        provideServerFunctionTransport((request) =>
          request.id === 'demo.products.list'
            ? [{ id: 'craft-starter', name: 'Craft Starter', available: true }]
            : Promise.reject(new Error(`unexpected ${request.id}`)),
        ),
      ],
    });
    element = document.createElement('div');
    document.body.append(element);
    mounted = mountCraftComponent(App, element, CraftTestBed.inject(Injector));
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

  it.each([
    ['/', 'Comprendre SSR par l’expérience'],
    ['/static', 'HTML statique rendu par le serveur'],
    ['/request?visitor=Ada', 'Personnalisation par URL'],
    ['/data', 'Query résolue avant la réponse'],
    ['/fallback', 'Shell serveur, contenu différé'],
    ['/client-only', 'Contenu réservé au navigateur'],
    ['/nowhere', 'Page non trouvée'],
  ])('opens %s', async (url, title) => {
    open(url);
    await vi.waitFor(() =>
      expect(element.querySelector('h1')?.textContent).toContain(title),
    );
  });

  it('lists the products the server function returns on the overview', async () => {
    open('/');
    await vi.waitFor(() => {
      expect(element.textContent).toContain('Produits rendus : 1');
      expect(element.textContent).toContain('Premier produit : Craft Starter');
    });
  });
});
