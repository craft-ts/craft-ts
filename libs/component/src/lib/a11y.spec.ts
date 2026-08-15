// @vitest-environment jsdom
import '@angular/compiler';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import {
  craftComponent,
  div,
  heading,
  headingRoot,
  headingSection,
  liveRegion,
  mountCraftComponent,
  skipLink,
} from '../index';
import type { CraftNodeChildrenHeadingNeed } from './render/vnode';

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

function host(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('heading outline', () => {
  it('renders h1 at the default route level', () => {
    const root = craftComponent(
      'headingPageTitle',
      {},
      () => ({}),
      () => heading('Liste des tâches'),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    expect(element.querySelector('h1')?.textContent).toBe('Liste des tâches');
  });

  it('increments the rank inside headingSection', () => {
    const root = craftComponent(
      'headingNestedSections',
      {},
      () => ({}),
      () =>
        headingSection([
          heading('Page'),
          headingSection([heading('Section')]),
        ]),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    expect(element.querySelector('h2')?.textContent).toBe('Page');
    expect(element.querySelector('h3')?.textContent).toBe('Section');
  });

  it('clamps at h6', () => {
    const root = craftComponent(
      'deep',
      {},
      () => ({}),
      () =>
        headingSection(
          headingSection(
            headingSection(
              headingSection(
                headingSection(headingSection(heading('Deep'))),
              ),
            ),
          ),
        ),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    expect(element.querySelector('h6')?.textContent).toBe('Deep');
    expect(element.querySelector('h7')).toBeNull();
  });

  it('bubbles heading need until headingSection absorbs it', () => {
    const exposed = heading('Title');
    expectTypeOf<CraftNodeChildrenHeadingNeed<typeof exposed>>().toEqualTypeOf<'heading'>();

    const covered = headingSection([heading('Title')]);
    expectTypeOf<CraftNodeChildrenHeadingNeed<typeof covered>>().toBeNever();

    const throughLayout = div([heading('Title')]);
    expectTypeOf<CraftNodeChildrenHeadingNeed<typeof throughLayout>>().toEqualTypeOf<'heading'>();
  });

  it('resets the outline at headingRoot', () => {
    const root = craftComponent(
      'headingRootPage',
      {},
      () => ({}),
      () =>
        headingSection([
          heading('Page'),
          headingRoot([heading('Dialog-like root')]),
        ]),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    expect(element.querySelector('h2')?.textContent).toBe('Page');
    expect(element.querySelector('h1')?.textContent).toBe('Dialog-like root');
  });

  it('lets a child expose heading() and requires the parent to wrap it', () => {
    const card = craftComponent(
      'headingNeedCard',
      {},
      () => ({}),
      () => heading('Card'),
    );
    const exposed = card();
    expectTypeOf<CraftNodeChildrenHeadingNeed<typeof exposed>>().toEqualTypeOf<'heading-from-child'>();

    const wrapped = headingSection([card()]);
    expectTypeOf<CraftNodeChildrenHeadingNeed<typeof wrapped>>().toBeNever();

    craftComponent(
      'headingNeedParentOk',
      {},
      () => ({}),
      () => headingSection([card()]),
    );

    craftComponent(
      'headingNeedParentBad',
      {},
      () => ({}),
      // @ts-expect-error parent must wrap the child heading in headingSection
      () => card(),
    );
  });
});

describe('liveRegion', () => {
  it('renders a polite status region by default', () => {
    const root = craftComponent(
      'toast',
      {},
      () => ({}),
      () => liveRegion('Copied'),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const region = element.querySelector('[aria-live]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.textContent).toBe('Copied');
  });
});

describe('liveRegion persistence', () => {
  it('stays mounted when the announced text is empty', () => {
    const root = craftComponent(
      'liveRegionEmpty',
      {},
      () => ({}),
      () => liveRegion({ label: 'Notifications' }, ''),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const region = element.querySelector('[aria-live]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('aria-label')).toBe('Notifications');
    expect(region?.textContent).toBe('');
  });
});

describe('skipLink', () => {
  it('points at main with a visible-on-focus class', () => {
    const root = craftComponent(
      'skipLinkShell',
      {},
      () => ({}),
      () => skipLink('main', 'Aller au contenu'),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const link = element.querySelector('a.skip-link');
    expect(link?.getAttribute('href')).toBe('#main');
    expect(link?.textContent).toBe('Aller au contenu');
  });
});
