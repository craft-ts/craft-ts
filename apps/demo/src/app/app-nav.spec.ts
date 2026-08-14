// @vitest-environment jsdom
import '@angular/compiler';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { mountCraftComponent } from '@craft-ng/component';
import { provideCraftRouter } from '@craft-ng/core';
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
      element.querySelector<HTMLButtonElement>('.demo-nav__toggle')?.click();
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
        expect(element.querySelector('.demo-nav__panel')).not.toBeNull(),
      );

      await clickNavLink(label);
      await vi.waitFor(() =>
        expect(element.querySelector('.demo-nav__panel')).toBeNull(),
      );
    }

    toggle();
    await vi.waitFor(() =>
      expect(element.querySelector('.demo-nav__panel')).not.toBeNull(),
    );

    mounted.destroy();
  });
});
