import { describe, expect, it } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import {
  registeredAtoms,
  registeredFonts,
  registeredGlobalRules,
  registeredKeyframes,
} from '@craft-ts/style';
import { renderCss } from '@craft-ts/style/vite';
import { DocBreadcrumb } from './breadcrumb.ts';
import { DocNavLink } from './nav-link.ts';
import { DocOutline } from './outline.ts';
import { DocPager } from './pager.ts';

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

describe('DocNavLink', () => {
  const render = (current: boolean, icon = '') =>
    renderCraftComponent(DocNavLink as never, {
      props: {
        label: reader('state'),
        href: reader('/guide/state/local-state'),
        current: reader(current),
        icon: reader(icon),
      } as never,
    });

  it('announces the current page with aria-current, the attribute the sheet reads', async () => {
    const current = await render(true);
    const link = current.element.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.getAttribute('href')).toBe('/guide/state/local-state');
    current.destroy();

    const other = await render(false);
    expect(other.element.querySelector('a')?.hasAttribute('aria-current')).toBe(
      false,
    );
    other.destroy();
  });

  it('draws a glyph before the label when it is given one', async () => {
    const rendered = await render(false, 'sprout');
    expect(rendered.element.querySelector('[data-icon="sprout"]')).not.toBeNull();
    rendered.destroy();
  });

  it('highlights on aria-current and keeps it under the pointer', () => {
    const sheet = css();
    expect(sheet).toContain("[aria-current='page']");
    expect(sheet).toMatch(/\[aria-current='page'\]:hover/);
  });
});

describe('DocBreadcrumb', () => {
  it('marks only the last crumb as the current page', async () => {
    const rendered = await renderCraftComponent(DocBreadcrumb as never, {
      props: {
        trail: reader([
          { label: 'Guide', href: '/guide/' },
          { label: 'State', href: '/guide/state/' },
          { label: 'Local state', href: '/guide/state/local-state' },
        ]),
      } as never,
    });
    const links = [...rendered.element.querySelectorAll('a')];

    expect(links.map((link) => link.textContent)).toEqual([
      'Guide',
      'State',
      'Local state',
    ]);
    expect(links.filter((link) => link.hasAttribute('aria-current'))).toEqual([
      links[2],
    ]);
    expect(rendered.element.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Breadcrumb',
    );
    rendered.destroy();
  });
});

describe('DocOutline', () => {
  it('lists the headings and marks the one in view', async () => {
    const rendered = await renderCraftComponent(DocOutline as never, {
      props: {
        heading: reader('On this page'),
        current: reader('b'),
        entries: reader([
          { level: 2, id: 'a', text: 'First' },
          { level: 3, id: 'b', text: 'Second' },
        ]),
      } as never,
    });
    const links = [...rendered.element.querySelectorAll('a')];

    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#a', '#b']);
    expect(links[1]?.getAttribute('aria-current')).toBe('true');
    expect(links[0]?.hasAttribute('aria-current')).toBe(false);
    rendered.destroy();
  });
});

describe('DocPager', () => {
  it('shows the links it has, previous quiet and next filled', async () => {
    const rendered = await renderCraftComponent(DocPager as never, {
      props: {
        previous: reader({ label: 'mutation', href: '/mutation' }),
        next: reader({ label: 'query', href: '/query' }),
      } as never,
    });
    const links = [...rendered.element.querySelectorAll('a')];

    expect(links.map((link) => link.getAttribute('rel'))).toEqual(['prev', 'next']);
    expect(links[0]?.getAttribute('data-variant')).toBe('secondary');
    expect(links[1]?.getAttribute('data-variant')).toBe('primary');
    rendered.destroy();

    const first = await renderCraftComponent(DocPager as never, {
      props: { previous: reader(null), next: reader({ label: 'query', href: '/q' }) } as never,
    });
    expect(first.element.querySelectorAll('a').length).toBe(1);
    first.destroy();
  });
});
