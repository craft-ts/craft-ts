// @vitest-environment jsdom
import '@angular/compiler';
import { Injector } from '@angular/core';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCraftComponent, mountCraftComponent } from '@craft-ng/component';
import {
  HostTag,
  provideCraftRouter,
  provideFnWrapper,
  withCraftViewTransitions,
} from '@craft-ng/core';
import { App } from '../../../app';
import { demoRoutes } from '../../../app.routes';
import FullDemoCraft from './full-demo';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

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

  it('does not rerun the TodoStore query without bound after Add', async () => {
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
    input!.value = 'Repro loop';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    element.querySelector<HTMLButtonElement>('button')!.click();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(todoQueryRuns).toBeLessThanOrEqual(8);
    expect(element.textContent).toContain('Full craftService demo');
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
