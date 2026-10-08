import { craftExpose, craftService, fromEventToSource$, state } from '@craft-ts/core';
import { MODE_STORAGE_KEY, NAVIGATED_EVENT } from '@craft-ts/docs-ui';
import { LOCKED_DARK_PATH } from './locked.ts';
import { documentTitle, pageDataFile, routeOfPath, type PageData } from './page-data.ts';

/** What the browser keeps with a history entry: how far the reader had scrolled. */
interface Entry {
  readonly y?: number;
}

/** A path that ends in an extension other than `.html` is a file, not a page. */
const isFile = (pathname: string): boolean => {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return /\.[a-z0-9]+$/i.test(last) && !last.endsWith('.html');
};

/** The link a press is on, when it should be a page change and not a load. */
const internalLink = (event: MouseEvent, base: string): HTMLAnchorElement | undefined => {
  if (event.defaultPrevented || event.button !== 0) return undefined;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return undefined;
  const anchor = (event.target as Element | null)?.closest?.('a[href]') as
    | HTMLAnchorElement
    | null
    | undefined;
  if (!anchor || anchor.hasAttribute('download')) return undefined;
  const target = anchor.getAttribute('target');
  if (target && target !== '_self') return undefined;
  if (anchor.origin !== location.origin) return undefined;
  if (!anchor.pathname.startsWith(base) || isFile(anchor.pathname)) return undefined;
  return anchor;
};

/** The appearance the reader chose, when they chose one. */
const storedMode = (): string | null => {
  try {
    const value = globalThis.localStorage?.getItem(MODE_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
};

/**
 * Runs `change`, then `then` once the document has stopped changing: drawing a page is not
 * synchronous with the state that asks for it (a long page is drawn in pieces), and a
 * scroll or a focus taken earlier lands on the page being replaced. Gives up waiting after
 * two seconds, so a page that draws nothing new still gets its scroll.
 */
const whenDrawn = (change: () => void, then: () => void): void => {
  let settle: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    observer.disconnect();
    clearTimeout(settle);
    clearTimeout(giveUp);
    then();
  };
  const observer = new MutationObserver(() => {
    clearTimeout(settle);
    settle = setTimeout(finish, 60);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  const giveUp = setTimeout(finish, 2000);
  change();
  // A change that draws nothing (the same content) must not wait for the give-up.
  settle = setTimeout(finish, 250);
};

const scrollTo = (hash: string, y: number | undefined): void => {
  const id = hash.length > 1 ? decodeURIComponent(hash.slice(1)) : '';
  const target = id ? document.getElementById(id) : null;
  if (target) target.scrollIntoView();
  else window.scrollTo(0, y ?? 0);
};

/**
 * Moving between pages without loading them. The pages stay what the build wrote — a
 * complete document each, for a first visit, a search engine, a link opened in a new
 * tab — and a press on an internal link fetches the data of the next one instead of the
 * document: the frame (bar, sidebar, appearance, season) stays where it is and only the
 * page changes. The first page is the one the server drew; until the reader moves, this
 * service holds nothing.
 *
 * Anything it cannot do — a page with no data, a network error — falls back to what the
 * browser does with a link, so the worst case is the old behaviour, not a dead link.
 */
export const { DocsNavigation, provideDocsNavigation } = craftService(
  { name: 'docsNavigation', providedIn: 'toProvide' },
  function* () {
    const shown = yield* state('page', null as PageData | null, ({ update }) => ({
      show: (page: PageData) => update(() => page),
    }));

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const base = document.documentElement.getAttribute('data-base') ?? '/';
      const site = document.documentElement.getAttribute('data-site-title') ?? document.title;
      let route = routeOfPath(location.pathname, base) ?? '/';
      // The Effect lessons are always read in the dark. The boot script writes that when a
      // page loads; moving between pages writes it too, and gives the reader's own
      // appearance back on leaving. `before` is what the document had when the lock was
      // taken; a page that loaded locked has the reader's choice in storage.
      let before: string | null | undefined = route.startsWith(LOCKED_DARK_PATH)
        ? storedMode()
        : undefined;
      const lockMode = (locked: boolean): void => {
        const root = document.documentElement;
        if (locked) {
          before ??= root.getAttribute('data-mode');
          root.setAttribute('data-mode', 'dark');
        } else if (before !== undefined) {
          if (before === null) root.removeAttribute('data-mode');
          else root.setAttribute('data-mode', before);
          before = undefined;
        }
      };
      let latest = 0;
      const cache = new Map<string, Promise<PageData | undefined>>();
      history.scrollRestoration = 'manual';

      const load = (target: string): Promise<PageData | undefined> => {
        const known = cache.get(target);
        if (known) return known;
        const request = fetch(`${base}${pageDataFile(target)}`)
          .then((response) => (response.ok ? (response.json() as Promise<PageData>) : undefined))
          .catch(() => undefined);
        cache.set(target, request);
        void request.then((page) => {
          if (!page) cache.delete(target);
        });
        return request;
      };

      const go = async (url: URL, push: boolean, y?: number): Promise<void> => {
        const target = routeOfPath(url.pathname, base);
        if (target === undefined) return;
        const ticket = ++latest;
        if (target === route) {
          // Same page: only the place in it changes.
          if (push) history.pushState({} satisfies Entry, '', url.href);
          scrollTo(url.hash, y);
          return;
        }
        const page = await load(target);
        if (ticket !== latest) return;
        if (!page) {
          location.assign(url.href);
          return;
        }
        if (push) {
          // Leaving this entry: it keeps how far the reader had read, for the way back.
          history.replaceState({ y: window.scrollY } satisfies Entry, '');
          history.pushState({} satisfies Entry, '', url.href);
        }
        route = target;
        lockMode(target.startsWith(LOCKED_DARK_PATH));
        document.title = documentTitle(site, page);
        whenDrawn(
          () => {
            shown.show(page);
            document.dispatchEvent(new CustomEvent(NAVIGATED_EVENT));
          },
          () => {
            scrollTo(url.hash, y);
            document.getElementById('main')?.focus({ preventScroll: true });
          },
        );
      };

      fromEventToSource$<MouseEvent>(document, 'click').subscribe((event) => {
        const anchor = internalLink(event, base);
        if (!anchor) return;
        const url = new URL(anchor.href);
        // A press on a link to a place in the page being read is the browser's to handle.
        if (url.pathname === location.pathname && url.search === location.search && url.hash) {
          return;
        }
        event.preventDefault();
        void go(url, true);
      });

      // Reading the data of a page as soon as the pointer is on its link, so that the press
      // finds it already here.
      fromEventToSource$<MouseEvent>(document, 'pointerover').subscribe((event) => {
        const anchor = (event.target as Element | null)?.closest?.('a[href]') as
          | HTMLAnchorElement
          | null
          | undefined;
        if (!anchor || anchor.origin !== location.origin || isFile(anchor.pathname)) return;
        const target = routeOfPath(anchor.pathname, base);
        if (target !== undefined && target !== route) void load(target);
      });

      // The browser has already left the entry when `popstate` arrives, so the place the
      // reader had reached has to be kept as they read.
      let saving: ReturnType<typeof setTimeout> | undefined;
      fromEventToSource$<Event>(window, 'scroll').subscribe(() => {
        clearTimeout(saving);
        saving = setTimeout(
          () => history.replaceState({ y: window.scrollY } satisfies Entry, ''),
          120,
        );
      });

      fromEventToSource$<PopStateEvent>(window, 'popstate').subscribe((event) => {
        const entry = (event.state ?? {}) as Entry;
        void go(new URL(location.href), false, entry.y);
      });
    }

    yield* craftExpose('go', shown.show);
  },
);
