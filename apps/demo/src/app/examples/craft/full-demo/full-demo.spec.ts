// @vitest-environment jsdom
import '@angular/compiler';
import { Injector, type Provider } from '@angular/core';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComponentTemplateOf,
  loadCraftComponent,
  mountCraftComponent,
  TemplateRendersNamedElementWhen,
} from '@craft-ng/component';
import {
  HostTag,
  provideCraftRouter,
  provideFnWrapper,
  withCraftViewTransitions,
} from '@craft-ng/core';
import { App } from '../../../app';
import { demoRoutes } from '../../../app.routes';
import FullDemoCraft from './full-demo';
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';

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
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(todoQueryRuns).toBe(queryRunsAfterLoad);

    element.querySelector<HTMLButtonElement>('button')!.click();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(todoQueryRuns).toBe(queryRunsAfterLoad);
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

describe('Full demo template', () => {
  type FullDemoTemplate = ComponentTemplateOf<typeof FullDemoCraft>;
  type _DisplayNewTodoNameInput = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemoCraft:input:TodoNameToAddInput'
      >,
      true
    >
  >;

  type _DisplayNewToDoSubmitButton = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemoCraft:button:AddTodoButton'
      >,
      true
    >
  >;

  type _DisplayRemoveTodoButton = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        FullDemoTemplate,
        'FullDemoCraft:button:RemoveTodoButton'
      >,
      true
    >
  >;

  it('keeps the template contract type-safe', () => {
    expect(true).toBe(true);
  });
});

describe('Full demo template runtime', () => {
  function mountFullDemo(providers: readonly Provider[] = []) {
    TestBed.configureTestingModule({ providers });
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      FullDemoCraft,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    return { element, mounted };
  }

  function observeMutationMethod(name: 'add' | 'remove', calls: unknown[]) {
    return provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (factory, thisArg, args) {
        const hostTags = yield* HostTag();
        const expectedArgument =
          name === 'add'
            ? typeof args[0] === 'string'
            : typeof args[0] === 'number';
        if (hostTags.includes(`mutation:${name}`) && expectedArgument) {
          calls.push(args[0]);
        }
        return yield* factory.apply(thisArg, args);
      },
    );
  }

  it('renders the initial TodoStore projection and named DOM elements', async () => {
    const { element, mounted } = mountFullDemo();

    try {
      await vi.waitFor(() =>
        expect(element.querySelectorAll('li')).toHaveLength(2),
      );

      expect(element.textContent).toContain('Full craftService demo');
      expect(element.textContent).toContain('Compose a craftService');
      expect(element.textContent).toContain('Expose query and mutations');
      expect(
        element.querySelector('[data-craft-name="TodoNameToAddInput"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-craft-name="AddTodoButton"]'),
      ).not.toBeNull();
      expect(
        element.querySelectorAll('[data-craft-name="RemoveTodoButton"]'),
      ).toHaveLength(2);
      expect(element.querySelector('.badge')?.textContent).toBe('Loaded');
    } finally {
      mounted.destroy();
    }
  });

  it('does not call add when the input contains only whitespace', async () => {
    const addCalls: unknown[] = [];
    const { element, mounted } = mountFullDemo([
      observeMutationMethod('add', addCalls),
    ]);

    try {
      await vi.waitFor(() =>
        expect(element.querySelectorAll('li')).toHaveLength(2),
      );

      const input = element.querySelector<HTMLInputElement>(
        '[data-craft-name="TodoNameToAddInput"]',
      )!;
      input.value = '   ';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      TestBed.tick();

      element
        .querySelector<HTMLButtonElement>('[data-craft-name="AddTodoButton"]')!
        .click();
      TestBed.tick();

      expect(addCalls).toEqual([]);
    } finally {
      mounted.destroy();
    }
  });

  it('passes the trimmed title to the add mutation', async () => {
    const addCalls: unknown[] = [];
    const { element, mounted } = mountFullDemo([
      observeMutationMethod('add', addCalls),
    ]);

    try {
      await vi.waitFor(() =>
        expect(element.querySelectorAll('li')).toHaveLength(2),
      );

      const input = element.querySelector<HTMLInputElement>(
        '[data-craft-name="TodoNameToAddInput"]',
      )!;
      input.value = '  Write runtime tests  ';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      TestBed.tick();

      element
        .querySelector<HTMLButtonElement>('[data-craft-name="AddTodoButton"]')!
        .click();
      TestBed.tick();

      await vi.waitFor(() => expect(addCalls).toEqual(['Write runtime tests']));
    } finally {
      mounted.destroy();
    }
  });

  it('passes the clicked todo id to the remove mutation', async () => {
    const removeCalls: unknown[] = [];
    const { element, mounted } = mountFullDemo([
      observeMutationMethod('remove', removeCalls),
    ]);

    try {
      await vi.waitFor(() =>
        expect(element.querySelectorAll('li')).toHaveLength(2),
      );

      const row = Array.from(element.querySelectorAll('li')).find((candidate) =>
        candidate.textContent?.includes('Compose a craftService'),
      );
      expect(row).toBeDefined();
      row
        ?.querySelector<HTMLButtonElement>(
          '[data-craft-name="RemoveTodoButton"]',
        )
        ?.click();
      TestBed.tick();

      await vi.waitFor(() => expect(removeCalls).toEqual([1]));
    } finally {
      mounted.destroy();
    }
  });
});
