import {
  a,
  button,
  craftComponent,
  CraftRouterOutlet,
  div,
  eventAction,
  forNode,
  ifNode,
  main,
  nav,
  safeUrl,
  skipLink,
  span,
  strong,
} from '@craft-ts/component';
import {
  BrowserLocation,
  BrowserWindow,
  craftComputed,
  craftMethod,
  CraftRouterLink,
  GlobalPersisterHandlerService,
  type CraftRouterLinkInput,
  state,
} from '@craft-ts/core';
import { demoEnabledRoutePaths } from './app.routes';
import { demoShell } from './demo-shell.style';

const DOCS_URL = 'https://craft-ts.github.io/craft/';
const FEEDBACK_URL = 'https://github.com/craft-ts/craft-ts/issues';

const NAV_GROUPS = [
  {
    label: 'Components',
    links: [
      ['Functional Components', { to: '' }],
      ['Type-safe i18n', { to: 'i18n' }],
      ['Reactive Composition', { to: 'component-composition' }],
      ['Content Projection', { to: 'content-projection' }],
      ['Pending Block', { to: 'pending-node' }],
      ['Pending Block — Exception', { to: 'pending-node/exception' }],
      ['CSS Variables — Overview', { to: 'css-vars' }],
      ['CSS Variables — Required', { to: 'css-vars/required' }],
      ['CSS Variables — Inheritance', { to: 'css-vars/inheritance' }],
      ['CSS Variables — Forwarding', { to: 'css-vars/forwarding' }],
      ['CSS Variables — @property', { to: 'css-vars/property' }],
    ],
  },
  {
    label: 'Design system',
    links: [
      ['Mini design system', { to: 'design-system' }],
      ['Context obligations', { to: 'design-system/scroll' }],
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
      ['State Machine', { to: 'state-machine' }],
      ['State Machine — text editor', { to: 'state-machine-text' }],
      ['State Machine — list', { to: 'state-machine-list' }],
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
] satisfies readonly {
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
  {},
  function* () {
    const navOpen = yield* state(
      'navOpen',
      false,
      ({ set, update, state: navOpenState }) => ({
        toggle: () => update((open) => !open),
        close: () => set(false),
        navToggleLabel: craftComputed('navToggleLabel', function* () {
          return (yield* navOpenState()) ? 'Close examples' : 'Browse examples';
        }),
      }),
    );
    const clearCache = craftMethod('clearCache', function* () {
      yield* GlobalPersisterHandlerService.clearAllCache();
      yield* BrowserWindow.alert('Cache cleared! The page will reload.');
      // This button is an explicit development reset action; reload after the
      // confirmation so every demo resource starts from the cleared cache.
      // eslint-disable-next-line craft-ts/no-imperative-storage-in-craft-method
      yield* BrowserLocation.reload();
    });
    return {
      clearCache,
      navOpen,
      closeNav: navOpen.close,
    };
  },
  ({ clearCache, navOpen, closeNav }) =>
    div({ class: demoShell.root }, [
      skipLink('main', 'Skip to content'),
      div(
        'demo-banner',
        { class: demoShell.banner, 'data-testid': 'demo-banner' },
        [
          div({ class: demoShell.bannerMain }, [
            strong({ class: demoShell.bannerStrong }, 'Beta demo'),
            span(' — the API and documentation may still evolve.'),
            a(
              'docs',
              {
                class: demoShell.bannerLink,
                href: safeUrl(DOCS_URL),
                target: '_blank',
                rel: 'noreferrer',
              },
              'Read the documentation',
            ),
            span(' · '),
            a(
              'feedback',
              {
                class: demoShell.bannerLink,
                href: safeUrl(FEEDBACK_URL),
                target: '_blank',
                rel: 'noreferrer',
              },
              'Your feedback is welcome',
            ),
          ]),
          div({ class: demoShell.bannerHint }, [
            'Tip: read ',
            strong({ class: demoShell.bannerHintStrong }, '`yield*`'),
            ' as “I need…”: each primitive or service becomes an explicit dependency.',
          ]),
        ],
      ),
      nav({ class: demoShell.nav }, [
        button(
          'navToggle',
          {
            class: demoShell.navToggle,
            'data-testid': 'nav-toggle',
            type: 'button',
            'aria-expanded': navOpen,
          },
          navOpen.navToggleLabel,
        ).pipe(
          eventAction({
            click: { action: navOpen.toggle, stopPropagation: true },
          }),
        ),
        ifNode(
          navOpen,
          () =>
            div(
              'navPanel',
              {
                class: demoShell.navPanel,
                'data-testid': 'nav-panel',
              },
              forNode(
                VISIBLE_NAV_GROUPS,
                { track: (group) => group.label },
                (group) =>
                  div({ class: demoShell.navGroup }, [
                    strong({ class: demoShell.navGroupTitle }, function* () {
                      return (yield* group()).label;
                    }),
                    div(
                      { class: demoShell.navLinks },
                      forNode(
                        function* () {
                          return (yield* group()).links;
                        },
                        { track: ([, link]) => link.to },
                        (entry) =>
                          a(
                            'navLink',
                            {
                              class: demoShell.navLink,
                              click: closeNav,
                            },
                            function* () {
                              return (yield* entry())[0];
                            },
                          ).pipe(
                            CraftRouterLink(function* () {
                              return (yield* entry())[1];
                            }),
                          ),
                      ),
                    ),
                  ]),
              ),
            ),
          () => [],
        ),
      ]),
      main(
        { id: 'main', class: demoShell.content, tabIndex: -1 },
        CraftRouterOutlet(),
      ),
      button(
        'clearCache',
        {
          class: demoShell.clearCache,
          type: 'button',
          click: clearCache,
        },
        '🗑️ Clear Cache',
      ),
    ]),
);
