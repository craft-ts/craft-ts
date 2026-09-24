// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import {
  ɵinjectCraftRouterRuntime,
  ɵrunInInjectionContext,
  provideCraftRouter,
} from '@craft-ts/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { demoRoutes } from './app.routes';

describe('App navbar', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('reopens the examples panel after several navigations', async () => {
    TestBed.configureTestingModule({
      providers: [provideCraftRouter(demoRoutes.toRoutes())],
    });

    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      App,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const toggle = () => {
      element.querySelector<HTMLButtonElement>('[data-testid="nav-toggle"]')?.click();
      TestBed.tick();
    };
    const clickNavLink = async (label: string) => {
      const link = await vi.waitFor(() => {
        const match = Array.from(
          element.querySelectorAll<HTMLAnchorElement>('a'),
        ).find((anchor) => anchor.textContent?.trim() === label);
        expect(match).toBeDefined();
        return match;
      });
      link!.click();
      TestBed.tick();
    };

    const destinations = [
      'Reactive Composition',
      'Content Projection',
      'CSS Variables — Overview',
      'Pixel Art',
    ];

    for (const label of destinations) {
      toggle();
      await vi.waitFor(() =>
        expect(element.querySelector('[data-testid="nav-panel"]')).not.toBeNull(),
      );

      await clickNavLink(label);
      await vi.waitFor(() =>
        expect(element.querySelector('[data-testid="nav-panel"]')).toBeNull(),
      );
    }

    toggle();
    await vi.waitFor(() =>
      expect(element.querySelector('[data-testid="nav-panel"]')).not.toBeNull(),
    );

    mounted.destroy();
  });

  it('intercepts an example link before closing the navigation panel', () => {
    TestBed.configureTestingModule({
      providers: [provideCraftRouter(demoRoutes.toRoutes())],
    });

    const router = ɵrunInInjectionContext(TestBed.inject(Injector), () =>
      ɵinjectCraftRouterRuntime(),
    );
    if (router === null) throw new Error('Craft router was not provided');
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      App,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    element.querySelector<HTMLButtonElement>('[data-testid="nav-toggle"]')?.click();
    TestBed.tick();
    const link = Array.from(element.querySelectorAll<HTMLAnchorElement>('a'))
      .find((anchor) => anchor.textContent?.trim() === 'Reactive Composition');

    expect(link).toBeDefined();
    if (link === undefined) {
      throw new Error('Reactive Composition link was not rendered');
    }
    link.click();

    expect(navigateByUrl).toHaveBeenCalledTimes(1);
    mounted.destroy();
  });

  it('lists Craft Lazy Layout when the parent lazy-layout route is enabled', async () => {
    TestBed.configureTestingModule({
      providers: [provideCraftRouter(demoRoutes.toRoutes())],
    });

    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      App,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    element.querySelector<HTMLButtonElement>('[data-testid="nav-toggle"]')?.click();
    TestBed.tick();

    const labels = Array.from(element.querySelectorAll('a')).map((anchor) =>
      anchor.textContent?.trim(),
    );
    expect(labels).toContain('Craft Lazy Layout');

    mounted.destroy();
  });
});
