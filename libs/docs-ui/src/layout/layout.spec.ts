import { afterEach, describe, expect, it } from 'vitest';
import { content, p, renderCraftComponent } from '@craft-ts/component';
import {
  registeredAtoms,
  registeredFonts,
  registeredGlobalRules,
  registeredKeyframes,
} from '@craft-ts/style';
import { renderCss } from '@craft-ts/style/vite';
import type { SiteConfig } from '../site/site.ts';
import { DocNotFound, DocHome } from './home.ts';
import { defaultLabels, DocLayout } from './layout.ts';

afterEach(() => {
  document.documentElement.removeAttribute('data-mode');
  document.body.replaceChildren();
});

const reader =
  <T>(value: T) =>
  function* () {
    return value;
  };

const css = () =>
  renderCss(registeredAtoms(), [], {
    reset: true,
    base: true,
    globals: registeredGlobalRules(),
    fonts: registeredFonts(),
    keyframes: registeredKeyframes(),
  });

const site: SiteConfig = {
  title: '@craft-ts',
  base: '/craft/',
  nav: [
    { text: 'Learn', link: '/learn/', activeMatch: '^/learn/' },
    { text: 'Guide', link: '/guide/', activeMatch: '^/guide/' },
    {
      text: 'Packages',
      items: [
        { text: '@craft-ts/core', link: 'https://www.npmjs.com/package/@craft-ts/core' },
      ],
    },
  ],
  sidebar: {
    '/guide/': [
      { text: 'Guide overview', link: '/guide/' },
      {
        text: 'Managing state',
        items: [
          { text: 'Local state', link: '/guide/state/local-state' },
          { text: 'query', link: '/guide/state/server-state' },
        ],
      },
      {
        text: 'Testing',
        collapsed: true,
        items: [{ text: 'Services', link: '/guide/testing/services' }],
      },
    ],
  },
};

const renderLayout = (
  path: string,
  extra: { scope?: '' | 'light' | 'dark' } = {},
) =>
  renderCraftComponent(DocLayout as never, {
    props: {
      site: reader(site),
      path: reader(path),
      outline: reader([
        { level: 2, id: 'common', text: 'The common case' },
        { level: 3, id: 'equal', text: 'Equality' },
      ]),
      currentHeading: reader('equal'),
      scope: reader(extra.scope ?? ''),
      searchIndex: reader([
        {
          href: '/guide/state/local-state',
          title: 'Local state',
          headings: ['The common case'],
          text: 'A signal holds one value.',
        },
      ]),
      footerNote: reader('MIT licensed'),
      footerLinks: reader([{ text: 'GitHub', href: 'https://github.com/craft-ts/craft-ts' }]),
      labels: reader(defaultLabels),
      badge: reader('Beta'),
      body: content(() => p('Page body.')),
    } as never,
  });

describe('DocLayout on a page of a section', () => {
  it('frames the page: bar, sections, sidebar, trail, outline, pager and foot', async () => {
    const rendered = await renderLayout('/craft/guide/state/local-state.html');
    const root = rendered.element;

    // The skip link comes first, and leads to the main landmark.
    expect(root.querySelector('a[href="#main"]')?.textContent).toBe(
      defaultLabels.skip,
    );
    expect(root.querySelector('main#main')?.textContent).toContain('Page body.');

    // The bar: the section is current, links carry the site's base.
    const sections = root.querySelector('header nav[aria-label="Sections"]');
    expect(sections?.querySelector('a[aria-current="page"]')?.textContent).toBe('Guide');
    expect(sections?.querySelector('a[href="/craft/learn/"]')).not.toBeNull();

    // The sidebar: numbered groups, the current row announced.
    const sidebar = root.querySelector('aside[aria-label="Documentation"]') as HTMLElement;
    expect(sidebar.textContent).toContain('i.');
    expect(sidebar.textContent).toContain('ii.');
    expect(
      sidebar.querySelector('a[aria-current="page"]')?.getAttribute('href'),
    ).toBe('/craft/guide/state/local-state');

    // The trail, the outline and the pager.
    expect(root.querySelector('nav[aria-label="Breadcrumb"]')?.textContent).toContain(
      'Managing state',
    );
    expect(
      root.querySelector('nav[aria-label="On this page"] a[aria-current="true"]')
        ?.getAttribute('href'),
    ).toBe('#equal');
    const pager = [...root.querySelectorAll('a[rel]')].map((a) => a.getAttribute('rel'));
    expect(pager).toEqual(['prev', 'next']);

    // The foot, and the badge.
    expect(root.querySelector('footer')?.textContent).toContain('MIT licensed');
    expect(root.textContent).toContain('Beta');
    rendered.destroy();
  });

  it('opens a group that holds the page and keeps a collapsed one closed', async () => {
    const rendered = await renderLayout('/guide/state/local-state');
    const groups = [...rendered.element.querySelectorAll('details')];
    expect(groups.length).toBe(1);
    expect((groups[0] as HTMLDetailsElement).open).toBe(false);
    rendered.destroy();

    const inside = await renderLayout('/guide/testing/services');
    const opened = inside.element.querySelector('details') as HTMLDetailsElement;
    expect(opened.open).toBe(true);
    inside.destroy();
  });

  it('has no sidebar, trail or outline on a page that belongs to no section', async () => {
    const rendered = await renderLayout('/craft/');
    expect(rendered.element.querySelector('aside')).toBeNull();
    expect(rendered.element.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
    expect(rendered.element.querySelector('main#main')).not.toBeNull();
    rendered.destroy();
  });

  it('forces a side for a subtree, through a scope the sheet answers', async () => {
    const rendered = await renderLayout('/guide/', { scope: 'dark' });
    const root = rendered.element.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-scope')).toBe('dark');
    expect(css()).toMatch(/\[data-scope='dark'\]\{--herbier-surface:#0f1914/i);
    rendered.destroy();

    const free = await renderLayout('/guide/');
    expect((free.element.firstElementChild as HTMLElement).hasAttribute('data-scope')).toBe(
      false,
    );
    free.destroy();
  });

  it('opens the search with the keyboard, and not before', async () => {
    const rendered = await renderLayout('/guide/');
    document.body.append(rendered.element);
    expect(rendered.element.querySelector('dialog')?.hasAttribute('open')).toBe(false);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true }),
    );
    await rendered.flush();
    const dialog = rendered.element.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe('doc-search-title');
    expect(dialog.querySelector('input')?.getAttribute('id')).toBe('doc-search-field');
    rendered.destroy();
  });

  it('opens the search from the bar', async () => {
    const rendered = await renderLayout('/guide/');
    (rendered.element.querySelector('button[aria-keyshortcuts]') as HTMLButtonElement).click();
    await rendered.flush();
    expect(rendered.element.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    rendered.destroy();
  });

  it('switches the appearance on the document root, and says where it goes', async () => {
    const rendered = await renderLayout('/guide/');
    const toggle = rendered.element.querySelector(
      `button[aria-label="${defaultLabels.mode}"]`,
    ) as HTMLButtonElement;
    expect(toggle).not.toBeNull();

    toggle.click();
    await rendered.flush();
    const first = document.documentElement.getAttribute('data-mode');
    expect(['light', 'dark']).toContain(first);

    toggle.click();
    await rendered.flush();
    const second = document.documentElement.getAttribute('data-mode');
    expect(second).not.toBe(first);
    rendered.destroy();
  });

  it('opens the drawer from the menu button, and says so', async () => {
    const rendered = await renderLayout('/guide/');
    const menu = rendered.element.querySelector(
      `button[aria-label="${defaultLabels.menu}"]`,
    ) as HTMLButtonElement;
    const sidebar = rendered.element.querySelector('aside[aria-label="Documentation"]') as HTMLElement;
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(sidebar.getAttribute('data-open')).toBe('false');

    menu.click();
    await rendered.flush();
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(sidebar.getAttribute('data-open')).toBe('true');
    rendered.destroy();
  });

  it('answers each breakpoint of the frame', () => {
    const sheet = css();
    expect(sheet).toContain('@media (min-width: 48rem)');
    expect(sheet).toContain('@media (min-width: 64rem)');
    expect(sheet).toContain("[data-sidebar='with']");
    expect(sheet).toContain("[data-open='true']");
  });
});

describe('DocHome', () => {
  const home = () =>
    renderCraftComponent(DocHome as never, {
      props: {
        hero: reader({
          name: '@craft-ts',
          text: 'Safe AI-first APP, by construction.',
          tagline: 'Declare. Yield. Derive.',
          plateCaption: 'Fig. 1. One state, branching into everything derived from it.',
          actions: [
            { theme: 'brand', text: 'Start the tutorial', link: '/learn/' },
            { theme: 'alt', text: 'Guide', link: '/guide/' },
          ],
        }),
        features: reader([
          { title: 'Fine-grained reactivity', details: 'Only that text updates.', link: '/guide/x' },
          { title: 'One API', details: 'Learn one, know five.', link: '' },
        ]),
        base: reader('/craft/'),
        extra: content(() => p('Start with an agent')),
      } as never,
    });

  it('puts the promise first, one filled action, the plate and the features', async () => {
    const rendered = await home();
    expect(rendered.element.querySelector('h1')?.textContent).toBe(
      'Safe AI-first APP, by construction.',
    );
    const buttons = [...rendered.element.querySelectorAll('a[data-variant]')];
    expect(buttons.map((b) => b.getAttribute('data-variant'))).toEqual(['primary', 'secondary']);
    expect(buttons[0]?.getAttribute('href')).toBe('/craft/learn/');
    expect(rendered.element.querySelector('figcaption')?.textContent).toContain('Fig. 1.');
    // A feature with a link is a door, one without is a statement.
    expect(rendered.element.querySelectorAll('a[href="/craft/guide/x"]').length).toBe(1);
    expect(rendered.element.textContent).toContain('Learn one, know five.');
    expect(rendered.element.textContent).toContain('Start with an agent');
    // The drawings are decoration: hidden from assistive technology.
    expect(rendered.element.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(1);
    rendered.destroy();
  });

  it('draws the forest in five planes, each one a mask in the theme colour', () => {
    const sheet = css();
    for (const layer of ['back', 'ridge', 'middle', 'near', 'front']) {
      expect(sheet).toContain(`[data-layer='${layer}']`);
    }
    expect(sheet).toContain('mask-image:url("data:image/svg+xml,');
    expect(sheet).toContain('--herbier-forestFront');
  });
});

describe('DocNotFound', () => {
  it('says so plainly and offers one way back', async () => {
    const rendered = await renderCraftComponent(DocNotFound as never, {
      props: {
        eyebrow: reader('404'),
        heading: reader('Off the trail'),
        message: reader('This page does not exist.'),
        homeLabel: reader('Back to the start'),
        homeHref: reader('/craft/'),
      } as never,
    });
    expect(rendered.element.querySelector('h1')?.textContent).toBe('Off the trail');
    const back = rendered.element.querySelector('a[data-variant="primary"]');
    expect(back?.getAttribute('href')).toBe('/craft/');
    expect(back?.textContent).toBe('Back to the start');
    rendered.destroy();
  });
});
