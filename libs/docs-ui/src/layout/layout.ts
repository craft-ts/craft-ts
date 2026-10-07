import {
  aside,
  craftComponent,
  div,
  main,
  renderContent,
  skipLink,
  type ContentSlot,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import {
  craftExpose,
  craftService,
  fromEventToSource$,
  state,
} from '@craft-ts/core';
import { DocBreadcrumb } from '../nav/breadcrumb.ts';
import { DocOutline } from '../nav/outline.ts';
import { DocPager } from '../nav/pager.ts';
import type { Outline } from '../markdown/tree.ts';
import type { SearchEntry } from '../site/search.ts';
import {
  normalizePath,
  pagerFor,
  sidebarFor,
  trailFor,
  withBase,
  type SiteConfig,
} from '../site/site.ts';
import { DocToastRegion, provideDocToastQueue } from '../toast/toast.ts';
import { DocFooter, type FooterLink } from './footer.ts';
import { layoutUi } from './layout.style.ts';
import { provideDocModeView } from './mode.ts';
import { DocNavbar } from './navbar.ts';
import { DocSearch } from './search.ts';
import { DocSidebar } from './sidebar.ts';

/** Every word the frame prints, so a translation changes one object. */
export interface LayoutLabels {
  readonly skip: string;
  readonly search: string;
  readonly searchHeading: string;
  readonly searchField: string;
  readonly searchPlaceholder: string;
  readonly searchEmpty: string;
  readonly mode: string;
  readonly menu: string;
  readonly sidebar: string;
  readonly onThisPage: string;
}

export const defaultLabels: LayoutLabels = {
  skip: 'Skip to main content',
  search: 'Search the docs',
  searchHeading: 'Search',
  searchField: 'Search the docs',
  searchPlaceholder: 'Type a word or a function name',
  searchEmpty: 'No page matches. Try fewer or different words.',
  mode: 'Switch between light and dark',
  menu: 'Open the navigation',
  sidebar: 'Documentation',
  onThisPage: 'On this page',
};

/**
 * What the frame owns: whether the search is open and whether the drawer is.
 * ⌘K and Ctrl+K open the search from anywhere on the page; the listener belongs
 * to this service and is not set up on the server.
 */
export const { DocLayoutView, provideDocLayoutView } = craftService(
  { name: 'docLayoutView', providedIn: 'toProvide' },
  function* () {
    const ui = yield* state(
      'ui',
      { searchOpen: false, navOpen: false },
      ({ update }) => ({
        openSearch: () => update((value) => ({ ...value, searchOpen: true })),
        closeSearch: () => update((value) => ({ ...value, searchOpen: false })),
        toggleNav: () =>
          update((value) => ({ ...value, navOpen: !value.navOpen })),
      }),
    );
    if (typeof document !== 'undefined') {
      fromEventToSource$<KeyboardEvent>(document, 'keydown').subscribe(
        (event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === 'k'
          ) {
            event.preventDefault();
            ui.openSearch();
          }
        },
      );
    }
    yield* craftExpose('openSearch', ui.openSearch);
    yield* craftExpose('closeSearch', ui.closeSearch);
    yield* craftExpose('toggleNav', ui.toggleNav);
  },
);

export type LayoutScope = '' | 'light' | 'dark';

export interface LayoutInput {
  readonly site: Input<SiteConfig>;
  /** The page being read, as the browser has it (base included). */
  readonly path: Input<string>;
  /** `parsePage().outline`. Empty on a page with no sections. */
  readonly outline: Input<readonly Outline[]>;
  /** The id of the section in view, for the outline. */
  readonly currentHeading: Input<string>;
  /** Forces a side whatever the page prefers: `dark` for the Effect lessons. */
  readonly scope: Input<LayoutScope>;
  readonly searchIndex: Input<readonly SearchEntry[]>;
  readonly footerNote: Input<string>;
  readonly footerLinks: Input<readonly FooterLink[]>;
  readonly labels: Input<LayoutLabels>;
  /** A status word beside the tools. Empty means none. */
  readonly badge: Input<string>;
  readonly body: ContentSlot;
}

/**
 * The frame of every page: a bar, a sidebar, the text, an outline, the pager and
 * the foot, with the search and the toasts above them all. The page itself is
 * the `body` slot. Everything it decides — which sidebar, which row is current,
 * where the trail leads, what comes next — it derives from the site and the path
 * with the pure functions of `site.ts`.
 */
export const DocLayout = craftComponent(
  'DocLayout',
  {
    providers: [
      provideDocLayoutView(),
      provideDocModeView(),
      provideDocToastQueue(),
    ],
  },
  function* (props: LayoutInput) {
    const view = yield* DocLayoutView();
    const site = yield* props.site();
    const path = yield* props.path();
    const labels = yield* props.labels();
    const scope = yield* props.scope();

    const target = normalizePath(path, site.base);
    const sidebar = sidebarFor(site, target);
    const hasSidebar = sidebar.length > 0;
    const pager = pagerFor(site, target);
    const trail = trailFor(site, target).map((crumb) => ({
      ...crumb,
      href: withBase(site.base, crumb.href),
    }));

    const columns: CraftNodeChild[] = [];
    if (hasSidebar) {
      columns.push(
        DocSidebar({
          entries: function* () {
            return sidebar;
          },
          sections: function* () {
            return site.nav;
          },
          path: function* () {
            return target;
          },
          base: function* () {
            return site.base;
          },
          label: function* () {
            return labels.sidebar;
          },
          open: function* () {
            return (yield* view.ui()).navOpen;
          },
        }),
      );
    }
    columns.push(
      main(
        {
          id: 'main',
          class: layoutUi.main,
          'data-sidebar': hasSidebar ? 'with' : 'without',
        },
        [
          ...(hasSidebar && trail.length > 0
            ? [
                div({ class: layoutUi.trail }, [
                  DocBreadcrumb({
                    trail: function* () {
                      return trail;
                    },
                  }),
                ]),
              ]
            : []),
          div(
            {
              class: layoutUi.article,
              'data-sidebar': hasSidebar ? 'with' : 'without',
            },
            renderContent('body', props.body),
          ),
          ...(hasSidebar && (pager.previous || pager.next)
            ? [
                div({ class: layoutUi.pager }, [
                  DocPager({
                    previous: function* () {
                      return pager.previous
                        ? {
                            label: pager.previous.text,
                            href: withBase(site.base, pager.previous.link),
                          }
                        : null;
                    },
                    next: function* () {
                      return pager.next
                        ? {
                            label: pager.next.text,
                            href: withBase(site.base, pager.next.link),
                          }
                        : null;
                    },
                  }),
                ]),
              ]
            : []),
        ],
      ),
    );
    if (hasSidebar) {
      columns.push(
        aside({ class: layoutUi.outline }, [
          DocOutline({
            entries: props.outline,
            current: props.currentHeading,
            heading: function* () {
              return labels.onThisPage;
            },
          }),
        ]),
      );
    }

    return div(
      {
        class: layoutUi.root,
        'data-sidebar': hasSidebar ? 'with' : 'without',
        ...(scope ? { 'data-scope': scope } : {}),
      },
      [
        skipLink('main', labels.skip),
        DocNavbar({
          brand: function* () {
            return site.title;
          },
          links: function* () {
            return site.nav;
          },
          path: function* () {
            return target;
          },
          base: function* () {
            return site.base;
          },
          badge: props.badge,
          searchLabel: function* () {
            return labels.search;
          },
          modeLabel: function* () {
            return labels.mode;
          },
          menuLabel: function* () {
            return labels.menu;
          },
          openSearch: view.openSearch as never,
          toggleNav: view.toggleNav as never,
          navOpen: function* () {
            return (yield* view.ui()).navOpen;
          },
        }),
        div(
          {
            class: layoutUi.shell,
            'data-sidebar': hasSidebar ? 'with' : 'without',
          },
          columns,
        ),
        DocFooter({ note: props.footerNote, links: props.footerLinks }),
        DocSearch({
          open: function* () {
            return (yield* view.ui()).searchOpen;
          },
          index: props.searchIndex,
          base: function* () {
            return site.base;
          },
          heading: function* () {
            return labels.searchHeading;
          },
          fieldLabel: function* () {
            return labels.searchField;
          },
          placeholder: function* () {
            return labels.searchPlaceholder;
          },
          emptyText: function* () {
            return labels.searchEmpty;
          },
          dismiss: view.closeSearch as never,
        }),
        DocToastRegion({}),
      ],
    );
  },
);
