import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateCraft, renderCraft } from '@craft-ts/component';
import type { SiteConfig } from '@craft-ts/docs-ui';
import { appConfig } from './app.config.ts';
import { asInputs, pageDataFile, routeOfPath } from './page-data.ts';
import { createDocs, type Docs } from './server/docs.ts';

const SRC_ROOT = path.resolve(import.meta.dirname, '../../docs');

const site: SiteConfig = {
  title: '@craft-ts',
  base: '/craft/',
  nav: [
    { text: 'Learn', link: '/learn/', activeMatch: '^/learn/' },
    { text: 'Learn with Effect', link: '/learn-effect/', activeMatch: '^/learn-effect/' },
    { text: 'Guide', link: '/guide/', activeMatch: '^/guide/' },
  ],
  sidebar: {
    '/learn/': [{ text: 'Learn', items: [{ text: 'Overview', link: '/learn/' }] }],
    '/guide/': [
      {
        text: 'Managing state',
        items: [{ text: 'Local state', link: '/guide/state/local-state' }],
      },
    ],
  },
};

let docs: Docs;
beforeAll(async () => {
  docs = await createDocs({ srcRoot: SRC_ROOT, site });
});
afterAll(() => docs.close());

describe('the data of a page', () => {
  it('is written under page-data, and a URL names it back', () => {
    expect(pageDataFile('/guide/a')).toBe('page-data/guide/a.json');
    expect(pageDataFile('/guide/')).toBe('page-data/guide/index.json');
    expect(pageDataFile('/')).toBe('page-data/index.json');
    expect(routeOfPath('/craft/guide/a', '/craft/')).toBe('/guide/a');
    expect(routeOfPath('/craft/guide/a.html', '/craft/')).toBe('/guide/a');
    expect(routeOfPath('/craft/guide/', '/craft/')).toBe('/guide/');
    expect(routeOfPath('/craft/guide/index.html', '/craft/')).toBe('/guide/');
    expect(routeOfPath('/craft/', '/craft/')).toBe('/');
    expect(routeOfPath('/elsewhere/', '/craft/')).toBeUndefined();
  });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 200));

/** Draws and hydrates a page the way the browser does when the reader first arrives. */
const arrive = async (route: string) => {
  const first = await docs.load(route);
  if (!first) throw new Error(`No page for ${route}`);
  document.documentElement.setAttribute('data-base', site.base);
  document.documentElement.setAttribute('data-site-title', site.title);
  history.replaceState({}, '', `${site.base}${route.replace(/^\//, '')}`);
  const props = asInputs({ site: docs.site, page: first.data });
  const rendered = await renderCraft({
    config: appConfig,
    props,
    url: `${site.base}${route.replace(/^\//, '')}`,
    includeStyles: false,
    mode: 'production',
  });
  document.body.innerHTML = rendered.html;
  const host = document.querySelector('craft-root') as HTMLElement;
  const hydrated = hydrateCraft({ config: appConfig, host, props, mode: 'production' });
  return { host, hydrated };
};

/** The last thing a page change does is move the focus to the page: that is its end. */
const arrived = () =>
  vi.waitFor(() => expect(document.activeElement?.id).toBe('main'), { timeout: 5000 });

const press = (anchor: Element, init: MouseEventInit = {}) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  anchor.dispatchEvent(event);
  return event;
};

const stubFetch = () => {
  const requested: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    requested.push(url);
    if (url.includes('search-index')) return { ok: true, json: async () => [] };
    const rest = new URL(url, location.origin).pathname
      .slice(`${site.base}page-data`.length)
      .replace(/\.json$/, '')
      .replace(/\/index$/, '/');
    const page = await docs.load(rest);
    return page
      ? { ok: true, json: async () => page.data }
      : { ok: false, json: async () => null };
  });
  return requested;
};

beforeEach(() => {
  // jsdom does not scroll: a stand-in that only records the place asked for.
  window.scrollTo = vi.fn() as never;
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-mode');
  document.title = '';
  document.body.replaceChildren();
});

describe('moving between pages without a load', () => {
  it('changes the page and keeps the frame: the bar is the same element', async () => {
    const requested = stubFetch();
    const { host, hydrated } = await arrive('/guide/');
    await flush();
    const bar = host.querySelector('header');
    const before = host.querySelector('main')?.textContent ?? '';
    expect(bar).not.toBeNull();

    const link = host.querySelector('a[href="/craft/guide/state/local-state"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    const event = press(link);
    await arrived();

    expect(event.defaultPrevented).toBe(true);
    expect(requested.some((url) => url.endsWith('/craft/page-data/guide/state/local-state.json'))).toBe(true);
    expect(location.pathname).toBe('/craft/guide/state/local-state');
    expect(document.title).toBe('Local state | @craft-ts');
    const after = host.querySelector('main')?.textContent ?? '';
    expect(after).not.toBe(before);
    expect(after).toContain('Local state');
    // The frame was not rebuilt: same element, not a copy of it.
    expect(host.querySelector('header')).toBe(bar);
    // The sidebar follows the reader to the page.
    expect(
      host.querySelector('aside a[aria-current="page"]')?.getAttribute('href'),
    ).toBe('/craft/guide/state/local-state');
    hydrated.destroy();
  });

  it('goes back to the page and to the place the reader had reached in it', async () => {
    stubFetch();
    const { host, hydrated } = await arrive('/guide/');
    await flush();
    const guideTitle = host.querySelector('main h1')?.textContent;
    Object.defineProperty(window, 'scrollY', { value: 240, configurable: true });

    press(host.querySelector('a[href="/craft/guide/state/local-state"]') as HTMLAnchorElement);
    await arrived();
    expect(host.querySelector('main h1')?.textContent).not.toBe(guideTitle);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mockClear();

    history.back();
    await vi.waitFor(() => expect(host.querySelector('main h1')?.textContent).toBe(guideTitle), {
      timeout: 5000,
    });
    expect(location.pathname).toBe('/craft/guide/');
    await vi.waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith(0, 240), { timeout: 5000 });
    delete (window as unknown as { scrollY?: number }).scrollY;
    hydrated.destroy();
  });

  it('leaves alone what the browser should handle: modifiers, new tabs, other sites, files', async () => {
    stubFetch();
    const { host, hydrated } = await arrive('/guide/');
    await flush();
    const link = host.querySelector('a[href="/craft/guide/state/local-state"]') as HTMLAnchorElement;

    expect(press(link, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press(link, { metaKey: true }).defaultPrevented).toBe(false);
    expect(press(link, { button: 1 }).defaultPrevented).toBe(false);

    link.setAttribute('target', '_blank');
    expect(press(link).defaultPrevented).toBe(false);
    link.removeAttribute('target');

    const external = document.createElement('a');
    external.href = 'https://github.com/craft-ts/craft-ts';
    host.append(external);
    expect(press(external).defaultPrevented).toBe(false);

    const file = document.createElement('a');
    file.href = '/craft/llms.txt';
    host.append(file);
    expect(press(file).defaultPrevented).toBe(false);
    expect(location.pathname).toBe('/craft/guide/');
    hydrated.destroy();
  });

  it('closes what the last page left open, and moves the focus to the new page', async () => {
    stubFetch();
    const { host, hydrated } = await arrive('/learn/');
    await flush();
    (host.querySelector('button[aria-keyshortcuts]') as HTMLButtonElement).click();
    await flush();

    // A link inside the open dialog: a search result, say.
    const link = document.createElement('a');
    link.href = '/craft/guide/state/local-state';
    host.querySelector('dialog')?.append(link);
    press(link);
    await arrived();

    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(host.querySelector('main'));
    hydrated.destroy();
  });

  it('falls back to a load when the page has no data', async () => {
    stubFetch();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...location, assign, origin: location.origin, pathname: location.pathname, search: '', hash: '' });
    const { host, hydrated } = await arrive('/learn/');
    await flush();
    const missing = document.createElement('a');
    missing.href = '/craft/guide/does-not-exist';
    host.append(missing);
    press(missing);
    await flush();
    expect(assign).toHaveBeenCalledWith(expect.stringContaining('/craft/guide/does-not-exist'));
    hydrated.destroy();
  });

  it('imposes the dark on the Effect lessons and gives the reader their choice back', async () => {
    stubFetch();
    const { host, hydrated } = await arrive('/learn/');
    await flush();
    document.documentElement.setAttribute('data-mode', 'light');

    const lesson = document.createElement('a');
    lesson.href = '/craft/learn-effect/';
    host.append(lesson);
    press(lesson);
    await arrived();
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
    expect(host.querySelector('button[aria-label^="Switch"]')).toBeNull();

    const back = document.createElement('a');
    back.href = '/craft/learn/';
    host.append(back);
    (document.activeElement as HTMLElement).blur();
    press(back);
    await arrived();
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    expect(host.querySelector('button[aria-label^="Switch"]')).not.toBeNull();
    hydrated.destroy();
  });
});
