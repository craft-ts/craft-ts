/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  a,
  button,
  craftComponent,
  CraftRouterOutlet,
  div,
  each,
  ifBlock,
  main,
  nav,
  skipLink,
  span,
  strong,
} from '@craft-ts/component';
import {
  BrowserLocation,
  BrowserWindow,
  craftMethod,
  CraftRouterLink,
  GlobalPersisterHandlerService,
  type CraftRouterLinkInput,
  state,
} from '@craft-ts/core';
import { demoEnabledRoutePaths } from './app.routes';

const DOCS_URL = 'https://craft-ts.github.io/craft/';
const FEEDBACK_URL = 'https://github.com/craft-ts/craft-ts/discussions';

const NAV_GROUPS = [
  {
    label: 'Components',
    links: [
      ['Functional Components', { to: '' }],
      ['Reactive Composition', { to: 'component-composition' }],
      ['Content Projection', { to: 'content-projection' }],
      ['Pending Block', { to: 'pending-block' }],
      ['Pending Block — Exception', { to: 'pending-block/exception' }],
      ['CSS Variables — Overview', { to: 'css-vars' }],
      ['CSS Variables — Required', { to: 'css-vars/required' }],
      ['CSS Variables — Inheritance', { to: 'css-vars/inheritance' }],
      ['CSS Variables — Forwarding', { to: 'css-vars/forwarding' }],
      ['CSS Variables — @property', { to: 'css-vars/property' }],
    ],
  },
  {
    label: 'Primitives',
    links: [
      ['Query', { to: 'query/:userId', params: { userId: '1' } }],
      ['Debounced Web Search', { to: 'debounced-web-search' }],
      ['Mutation', { to: 'mutation/:userId', params: { userId: '1' } }],
      ['List Pagination', { to: 'list-with-pagination' }],
      ['Query Params', { to: 'query-params' }],
      ['Granular Mutation', { to: 'granular-mutation' }],
      ['Full Demo', { to: 'full-demo' }],
      ['Slow Page', { to: 'slow-page' }],
      ['View Transitions', { to: 'view-transitions' }],
      ['Pixel Art', { to: 'pixel-art' }],
      ['Pixel Art Matrix', { to: 'pixel-art-matrix' }],
      ['Exceptions', { to: 'exceptions' }],
      ['Login Form', { to: 'login-form' }],
      ['Exception QueryParams', { to: 'exception-query-params' }],
    ],
  },
  {
    label: 'Craft',
    links: [
      ['Craft Query', { to: 'craft/query/:userId', params: { userId: '1' } }],
      [
        'Craft Mutation',
        { to: 'craft/mutation/:userId', params: { userId: '1' } },
      ],
      ['Craft List Pagination', { to: 'craft/list-with-pagination' }],
      ['Craft Granular Mutation', { to: 'craft/granular-mutation' }],
      ['Craft Full Demo', { to: 'craft/full-demo' }],
      [
        'Craft Lazy Layout',
        {
          to: 'craft/lazy-layout/:teamId/users/:userId',
          params: { teamId: '100', userId: '42' },
        },
      ],
      ['craftService Counter', { to: 'craft-service/counter' }],
      ['craftRegisterFor', { to: 'craft-service/register-for' }],
      ['craftService User Detail', { to: 'craft-service/user-detail' }],
    ],
  },
  {
    label: 'Other',
    links: [
      ['Demo Send Context', { to: 'demo-send-context' }],
      ['Guard demo', { to: 'guard-demo' }],
    ],
  },
] as const satisfies readonly {
  readonly label: string;
  readonly links: readonly (readonly [string, CraftRouterLinkInput])[];
}[];

const VISIBLE_NAV_GROUPS = NAV_GROUPS.map((group) => ({
  ...group,
  links: group.links.filter(([, link]) => isEnabledDemoRoute(link.to)),
})).filter((group) => group.links.length > 0);

/**
 * Runtime `META_PATHS` lists each `craftRoutes` entry, not the flattened
 * `loadChildren` URLs. A nav link that targets a lazy child (for example
 * `craft/lazy-layout/:teamId/users/:userId`) is enabled when its parent path
 * was selected in the serve prompt.
 */
export function isEnabledDemoRoute(to: string): boolean {
  if (demoEnabledRoutePaths.has(to)) {
    return true;
  }
  for (const path of demoEnabledRoutePaths) {
    if (path !== '' && to.startsWith(`${path}/`)) {
      return true;
    }
  }
  return false;
}

export const App = craftComponent(
  'App',
  {
    styles: `
      :scope{display:flex;flex-direction:column;height:100vh;background:#fafafa}
      .skip-link{position:absolute;left:-9999px;z-index:10;padding:.5rem .75rem;background:#1d4ed8;color:#fff;border-radius:.3rem;font-weight:700}
      .skip-link:focus,.skip-link:focus-visible{left:1rem;top:1rem}
      a:focus-visible,button:focus-visible{outline:2px solid #1d4ed8;outline-offset:2px}
      .demo-banner{display:grid;gap:.25rem;padding:.7rem 1.25rem;background:#eff6ff;border-bottom:1px solid #bfdbfe;color:#1e3a8a;font-size:.85rem;line-height:1.45;flex-shrink:0}
      .demo-banner__main{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .5rem}.demo-banner__main strong{font-weight:700}.demo-banner a{color:#1d4ed8;font-weight:700;text-decoration:underline;text-underline-offset:2px}.demo-banner a:hover{color:#1e3a8a}
      .demo-banner__hint{color:#475569;font-size:.8rem}.demo-banner__hint strong{color:#1e293b}
      .demo-nav{position:relative;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem 1.25rem;background:#fff;border-bottom:1px solid #e5e7eb;z-index:2}
      .demo-nav__toggle{padding:.55rem .8rem;border:1px solid #d1d5db;border-radius:.45rem;background:#fff;color:#374151;font:inherit;font-weight:600;cursor:pointer}.demo-nav__toggle:hover{background:#f3f4f6}
      .demo-nav__panel{position:absolute;top:calc(100% + .5rem);left:1.25rem;right:1.25rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:1.25rem;padding:1rem;background:#fff;border:1px solid #e5e7eb;border-radius:.75rem;box-shadow:0 12px 30px #1118271c}
      .demo-nav__group{display:grid;align-content:start;gap:.45rem}.demo-nav__group strong{color:#111827;font-size:.85rem}.demo-nav__links{display:grid;gap:.15rem}.demo-nav__links a{padding:.35rem .45rem;border-radius:.3rem;text-decoration:none;color:#4b5563;font-size:.9rem}.demo-nav__links a:hover{color:#111827;background:#f3f4f6}
      .content{flex:1;overflow:auto;padding:2rem;background:#fff;margin:1.5rem;border-radius:8px}.clear-cache-btn{position:fixed;bottom:2rem;right:2rem;padding:1rem 1.5rem;background:#374151;color:#fff;border:0;border-radius:50px;cursor:pointer}
    `,
  },
  function* () {
    const navOpen = yield* state('navOpen', false, ({ set, update }) => ({
      toggle: () => update((open) => !open),
      close: () => set(false),
    }));
    const toggleNav = craftMethod('toggleNav', function* (event?: Event) {
      event?.stopPropagation();
      yield* navOpen.toggle();
    });
    const clearCache = craftMethod('clearCache', function* () {
      const persister = yield* GlobalPersisterHandlerService(
        undefined,
        ({ clearAllCache }) => ({ clearAllCache }),
      );
      persister.clearAllCache();
      yield* BrowserWindow.alert('Cache cleared! The page will reload.');
      yield* BrowserLocation.reload();
    });
    return {
      clearCache,
      navOpen,
      toggleNav,
      closeNav: navOpen.close,
    };
  },
  ({ clearCache, navOpen, toggleNav, closeNav }) =>
    div([
        skipLink('main', 'Skip to content'),
        div({ class: 'demo-banner' }, [
          div({ class: 'demo-banner__main' }, [
            strong('Beta demo'),
            span(' — the API and documentation may still evolve.'),
            a('docs',
              {
                href: DOCS_URL,
                target: '_blank',
                rel: 'noreferrer',
              },
              'Read the documentation',
            ),
            span(' · '),
            a('feedback',
              {
                href: FEEDBACK_URL,
                target: '_blank',
                rel: 'noreferrer',
              },
              'Your feedback is welcome',
            ),
          ]),
          div({ class: 'demo-banner__hint' }, [
            'Tip: read ',
            strong('`yield*`'),
            ' as “I need…”: each primitive or service becomes an explicit dependency.',
          ]),
        ]),
        nav({ class: 'demo-nav' }, [
          button(
            'navToggle',
            {
              class: 'demo-nav__toggle',
              type: 'button',
              click: toggleNav,
              'aria-expanded': navOpen,
            },
            function* () {
              return (yield* navOpen()) ? 'Close examples' : 'Browse examples';
            },
          ),
          ifBlock(
            navOpen,
            () =>
              div(
                'navPanel',
                {
                  class: 'demo-nav__panel',
                  click: (event: MouseEvent) => event.stopPropagation(),
                },
                each(
                  VISIBLE_NAV_GROUPS,
                  { track: (group) => group.label },
                  (group) =>
                    div({ class: 'demo-nav__group' }, [
                      strong(function* () {
                        return (yield* group()).label;
                      }),
                      div(
                        { class: 'demo-nav__links' },
                        each(
                          function* () {
                            return (yield* group()).links;
                          },
                          { track: ([, link]) => link.to },
                          (entry) =>
                            a(
                              'navLink',
                              {
                                click: closeNav,
                                craftRouterLink: function* () {
                                  return (yield* entry())[1];
                                },
                              },
                              function* () {
                                return (yield* entry())[0];
                              },
                            ).pipe(CraftRouterLink),
                        ),
                      ),
                    ]),
                ),
              ),
            () => [],
          ),
        ]),
        main({ id: 'main', class: 'content', tabIndex: -1 }, CraftRouterOutlet()),
        button('clearCache',
          {
            class: 'clear-cache-btn',
            type: 'button',
            *click() {
              yield* clearCache();
            },
          },
          '🗑️ Clear Cache',
        ),
      ],
    ),
);
