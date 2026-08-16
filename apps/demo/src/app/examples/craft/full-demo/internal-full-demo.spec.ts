// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ng/core';
import { loadCraftComponent, mountCraftComponent } from '@craft-ng/component';
import {
  HostTag,
  provideCraftRouter,
  provideFnWrapper,
  withCraftViewTransitions,
} from '@craft-ng/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../app';
import { demoRoutes } from '../../../app.routes';
import FullDemoCraft from './full-demo';

describe('Craft Full Demo route component', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('renders the source UI for the provided TodoStore query', async () => {
    const lazyRoute = loadCraftComponent(async () => FullDemoCraft);
    const routedHost = await lazyRoute.loadComponent(
      {} as Parameters<typeof lazyRoute.loadComponent>[0],
    );
    TestBed.configureTestingModule({ providers: lazyRoute.providers });

    const fixture = TestBed.createComponent(routedHost);
    fixture.detectChanges();
    TestBed.tick();
    const element = fixture.nativeElement as HTMLElement;

    await vi.waitFor(() =>
      expect(element.textContent).toContain('Full craftService demo'),
    );

    expect(element.querySelector('input[placeholder="New todo"]')).not.toBe(
      null,
    );
    expect(
      Array.from(element.querySelectorAll('button')).some(
        (button) => button.textContent?.trim() === 'Add',
      ),
    ).toBe(true);

    fixture.destroy();
  });

  it('does not rerun the TodoStore query while typing or after Add', async () => {
    let todoQueryRuns = 0;
    const lazyRoute = loadCraftComponent(async () => FullDemoCraft);
    const routedHost = await lazyRoute.loadComponent(
      {} as Parameters<typeof lazyRoute.loadComponent>[0],
    );
    TestBed.configureTestingModule({
      providers: [
        ...lazyRoute.providers,
        provideFnWrapper(
          'Warning: dependency injection here is not type-safe and may fail at runtime',
          function* (factory, thisArg, args) {
            const hostTags = yield* HostTag();
            if (hostTags.some((tag) => tag.includes('query:todos'))) {
              todoQueryRuns += 1;
              if (todoQueryRuns > 20) {
                throw new Error('FULL_DEMO_QUERY_LOOP_GUARD');
              }
            }
            return yield* factory.apply(thisArg, args);
          },
        ),
      ],
    });

    const fixture = TestBed.createComponent(routedHost);
    fixture.detectChanges();
    TestBed.tick();
    const element = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() =>
      expect(element.textContent).toContain('Full craftService demo'),
    );

    const input = element.querySelector<HTMLInputElement>(
      'input[placeholder="New todo"]',
    );
    const queryRunsAfterLoad = todoQueryRuns;
    input!.value = 'Typing must not reload';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(todoQueryRuns).toBe(queryRunsAfterLoad));

    element.querySelector<HTMLButtonElement>('button')!.click();

    await vi.waitFor(() => {
      expect(todoQueryRuns).toBe(queryRunsAfterLoad);
      expect(element.textContent).toContain('Full craftService demo');
      expect(element.textContent).toContain('Typing must not reload');
    });
    fixture.destroy();
  });

  it('navigates from the app shell to Craft Full Demo without a query loop', async () => {
    let todoQueryRuns = 0;
    let viewTransitionCalls = 0;
    const viewTransitionDocument = document as unknown as {
      startViewTransition?: (callback: () => void) => unknown;
    };
    const originalStartViewTransition =
      viewTransitionDocument.startViewTransition;
    viewTransitionDocument.startViewTransition = (callback) => {
      viewTransitionCalls += 1;
      if (viewTransitionCalls > 20) {
        throw new Error('FULL_DEMO_VIEW_TRANSITION_LOOP_GUARD');
      }
      queueMicrotask(callback);
      return {};
    };

    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter(demoRoutes.toRoutes(), withCraftViewTransitions()),
        provideFnWrapper(
          'Warning: dependency injection here is not type-safe and may fail at runtime',
          function* (factory, thisArg, args) {
            const hostTags = yield* HostTag();
            if (hostTags.some((tag) => tag.includes('query:todos'))) {
              todoQueryRuns += 1;
              if (todoQueryRuns > 20) {
                throw new Error('FULL_DEMO_ROUTE_QUERY_LOOP_GUARD');
              }
            }
            return yield* factory.apply(thisArg, args);
          },
        ),
      ],
    });

    try {
      const element = document.createElement('div');
      document.body.append(element);
      const mounted = mountCraftComponent(
        App,
        element,
        TestBed.inject(Injector),
      );
      TestBed.tick();

      element.querySelector<HTMLButtonElement>('.demo-nav__toggle')?.click();
      TestBed.tick();

      const fullDemoLink = await vi.waitFor(() => {
        const link = Array.from(
          element.querySelectorAll<HTMLAnchorElement>('a'),
        ).find((anchor) => anchor.textContent?.trim() === 'Craft Full Demo');
        expect(link).toBeDefined();
        return link;
      });
      expect(fullDemoLink).toBeDefined();
      expect(fullDemoLink?.getAttribute('href')).toContain('/craft/full-demo');
      fullDemoLink!.click();
      TestBed.tick();

      await vi.waitFor(() =>
        expect(element.textContent).toContain('Full craftService demo'),
      );
      expect(todoQueryRuns).toBeLessThanOrEqual(8);
      expect(viewTransitionCalls).toBeLessThanOrEqual(20);

      mounted.destroy();
    } finally {
      if (originalStartViewTransition) {
        viewTransitionDocument.startViewTransition =
          originalStartViewTransition;
      } else {
        delete viewTransitionDocument.startViewTransition;
      }
    }
  });
});
