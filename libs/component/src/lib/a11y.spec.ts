import { craftService } from '@craft-ts/core';
// @vitest-environment jsdom
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  craftComponent,
  div,
  heading,
  headingRoot,
  headingSection,
  liveRegion,
  skipLink,
} from '../index';
import type { CraftNodeChildrenHeadingNeed } from './render/vnode';
import { renderCraftComponent } from './testing';

function host(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('heading outline', () => {
  it('renders h1 at the default route level', async () => {
    const { HeadingPageTitleView, provideHeadingPageTitleView } = craftService(
      { name: 'headingPageTitleView', providedIn: 'toProvide' },
      () => ({}),
    );

    const root = craftComponent(
      'headingPageTitle',
      { providers: [provideHeadingPageTitleView()] },
      function* () {
        yield* HeadingPageTitleView();
        return heading('Liste des tâches');
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    expect(element.querySelector('h1')?.textContent).toBe('Liste des tâches');
  });

  it('increments the rank inside headingSection', async () => {
    const { HeadingNestedSectionsView, provideHeadingNestedSectionsView } =
      craftService(
        { name: 'headingNestedSectionsView', providedIn: 'toProvide' },
        () => ({}),
      );

    const root = craftComponent(
      'headingNestedSections',
      { providers: [provideHeadingNestedSectionsView()] },
      function* () {
        yield* HeadingNestedSectionsView();
        return headingSection([
          heading('Page'),
          headingSection([heading('Section')]),
        ]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    expect(element.querySelector('h2')?.textContent).toBe('Page');
    expect(element.querySelector('h3')?.textContent).toBe('Section');
  });

  it('clamps at h6', async () => {
    const { DeepView, provideDeepView } = craftService(
      { name: 'deepView', providedIn: 'toProvide' },
      () => ({}),
    );

    const root = craftComponent(
      'deep',
      { providers: [provideDeepView()] },
      function* () {
        yield* DeepView();
        return headingSection(
          headingSection(
            headingSection(
              headingSection(headingSection(headingSection(heading('Deep')))),
            ),
          ),
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    expect(element.querySelector('h6')?.textContent).toBe('Deep');
    expect(element.querySelector('h7')).toBeNull();
  });

  it('bubbles heading need until headingSection absorbs it', async () => {
    const exposed = heading('Title');
    expectTypeOf<
      CraftNodeChildrenHeadingNeed<typeof exposed>
    >().toEqualTypeOf<'heading'>();

    const covered = headingSection([heading('Title')]);
    expectTypeOf<CraftNodeChildrenHeadingNeed<typeof covered>>().toBeNever();

    const throughLayout = div([heading('Title')]);
    expectTypeOf<
      CraftNodeChildrenHeadingNeed<typeof throughLayout>
    >().toEqualTypeOf<'heading'>();
  });

  it('resets the outline at headingRoot', async () => {
    const { HeadingRootPageView, provideHeadingRootPageView } = craftService(
      { name: 'headingRootPageView', providedIn: 'toProvide' },
      () => ({}),
    );

    const root = craftComponent(
      'headingRootPage',
      { providers: [provideHeadingRootPageView()] },
      function* () {
        yield* HeadingRootPageView();
        return headingSection([
          heading('Page'),
          headingRoot([heading('Dialog-like root')]),
        ]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    expect(element.querySelector('h2')?.textContent).toBe('Page');
    expect(element.querySelector('h1')?.textContent).toBe('Dialog-like root');
  });

  it('lets a child expose heading() and requires the parent to wrap it', async () => {
    const { HeadingNeedCardView, provideHeadingNeedCardView } = craftService(
      { name: 'headingNeedCardView', providedIn: 'toProvide' },
      () => ({}),
    );

    const card = craftComponent(
      'headingNeedCard',
      { providers: [provideHeadingNeedCardView()] },
      function* () {
        yield* HeadingNeedCardView();
        return heading('Card');
      },
    );
    const exposed = card();
    expectTypeOf<
      CraftNodeChildrenHeadingNeed<typeof exposed>
    >().toEqualTypeOf<'heading-from-child'>();

    const wrapped = headingSection([card()]);
    expectTypeOf<CraftNodeChildrenHeadingNeed<typeof wrapped>>().toBeNever();

    const { HeadingNeedParentOkView, provideHeadingNeedParentOkView } =
      craftService(
        { name: 'headingNeedParentOkView', providedIn: 'toProvide' },
        () => ({}),
      );

    craftComponent(
      'headingNeedParentOk',
      { providers: [provideHeadingNeedParentOkView()] },
      function* () {
        yield* HeadingNeedParentOkView();
        return headingSection([card()]);
      },
    );

    craftComponent(
      'headingNeedParentBad',
      {},
      // @ts-expect-error parent must wrap the child heading in headingSection
      () => card(),
    );
  });
});

describe('liveRegion', () => {
  it('renders a polite status region by default', async () => {
    const { ToastView, provideToastView } = craftService(
      { name: 'toastView', providedIn: 'toProvide' },
      () => ({}),
    );

    const root = craftComponent(
      'toast',
      { providers: [provideToastView()] },
      function* () {
        yield* ToastView();
        return liveRegion('Copied');
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    const region = element.querySelector('[aria-live]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.textContent).toBe('Copied');
  });
});

describe('liveRegion persistence', () => {
  it('stays mounted when the announced text is empty', async () => {
    const { LiveRegionEmptyView, provideLiveRegionEmptyView } = craftService(
      { name: 'liveRegionEmptyView', providedIn: 'toProvide' },
      () => ({}),
    );

    const root = craftComponent(
      'liveRegionEmpty',
      { providers: [provideLiveRegionEmptyView()] },
      function* () {
        yield* LiveRegionEmptyView();
        return liveRegion({ label: 'Notifications' }, '');
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    const region = element.querySelector('[aria-live]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('aria-label')).toBe('Notifications');
    expect(region?.textContent).toBe('');
  });
});

describe('skipLink', () => {
  it('points at main with a visible-on-focus class', async () => {
    const { SkipLinkShellView, provideSkipLinkShellView } = craftService(
      { name: 'skipLinkShellView', providedIn: 'toProvide' },
      () => ({}),
    );

    const root = craftComponent(
      'skipLinkShell',
      { providers: [provideSkipLinkShellView()] },
      function* () {
        yield* SkipLinkShellView();
        return skipLink('main', 'Aller au contenu');
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);
    const link = element.querySelector('a.skip-link');
    expect(link?.getAttribute('href')).toBe('#main');
    expect(link?.textContent).toBe('Aller au contenu');
  });
});
