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
  fromEventToSource$,
  type CraftRouterLinkInput,
  state,
  craftService,
} from '@craft-ts/core';
import { demoEnabledRoutePaths } from './app.routes';
import { demoShell } from './demo-shell.style';
import {
  DocModeToggle,
  provideDocModeView,
  DocSeasonPicker,
  provideDocSeasonView,
  defaultSeasonNames,
} from '@craft-ts/ui';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';

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
      ['Interaction State Replay', { to: 'interaction-replay' }],
    ],
  },
  {
    label: 'Design system',
    links: [
      ['Mini design system', { to: 'design-system' }],
      ['Context obligations', { to: 'design-system/scroll' }],
      ['Herbier components', { to: 'herbier' }],
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

function focusExampleLink(
  event: KeyboardEvent,
  direction: 'first' | 'last' | 'next' | 'previous',
) {
  const panel = (event.currentTarget as HTMLElement).closest(
    '[data-testid="nav-panel"]',
  );
  const links = panel?.querySelectorAll<HTMLAnchorElement>(
    '[data-testid="nav-link"]',
  );
  if (!links?.length) return;

  event.preventDefault();
  const currentIndex = [...links].indexOf(
    event.currentTarget as HTMLAnchorElement,
  );
  const nextIndex =
    direction === 'first'
      ? 0
      : direction === 'last'
        ? links.length - 1
        : (currentIndex + (direction === 'next' ? 1 : -1) + links.length) %
          links.length;
  links[nextIndex]?.focus();
}

function handleNavLinkKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') focusExampleLink(event, 'next');
  if (event.key === 'ArrowUp') focusExampleLink(event, 'previous');
  if (event.key === 'Home') focusExampleLink(event, 'first');
  if (event.key === 'End') focusExampleLink(event, 'last');
  if (event.key === 'Escape') {
    event.preventDefault();
    AppView.navOpen.close();
    document
      .querySelector<HTMLButtonElement>('[data-testid="nav-toggle"]')
      ?.focus();
  }
}

function handleNavToggleKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const panel = document.querySelector<HTMLElement>(
      '[data-testid="nav-panel"]',
    );
    if (panel) {
      const links = panel.querySelectorAll<HTMLAnchorElement>(
        '[data-testid="nav-link"]',
      );
      links[event.key === 'ArrowDown' ? 0 : links.length - 1]?.focus();
    } else {
      event.preventDefault();
      AppView.navOpen.toggle();
      requestAnimationFrame(() => {
        const links = document.querySelectorAll<HTMLAnchorElement>(
          '[data-testid="nav-panel"] [data-testid="nav-link"]',
        );
        links[event.key === 'ArrowDown' ? 0 : links.length - 1]?.focus();
      });
    }
  } else if (
    event.key === 'Escape' &&
    document.querySelector('[data-testid="nav-panel"]')
  ) {
    event.preventDefault();
    AppView.navOpen.close();
  }
}

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

export const { AppView, provideAppView } = craftService(
  { name: 'appView', providedIn: 'toProvide' },
  function* () {
    const navOpen = yield* state(
      'navOpen',
      false,
      ({ set, update }) => ({
        toggle: () => update((open) => !open),
        close: () => set(false),
      }),
    );
    if (typeof document !== 'undefined') {
      fromEventToSource$<PointerEvent>(document, 'pointerdown').subscribe(
        (event) => {
          const target = event.target;
          if (!(target instanceof Node)) return;

          const panel = document.querySelector('[data-testid="nav-panel"]');
          const toggle = document.querySelector('[data-testid="nav-toggle"]');
          if (!panel?.contains(target) && !toggle?.contains(target)) {
            navOpen.close();
          }
        },
      );
    }
    yield* craftComputed('navToggleLabel', function* () {
      return (yield* navOpen()) ? 'Close examples' : 'Browse examples';
    });
    yield* craftMethod('clearCache', function* () {
      yield* GlobalPersisterHandlerService.clearAllCache();
      // This button is an explicit development reset action; reload so every
      // demo resource starts from the cleared cache. The session recorder
      // captures this intentional alert and the replay bridge simulates it.
      yield* BrowserWindow.alert('Cache cleared! The page will reload.');
      yield* BrowserLocation.reload();
    });
  },
);

export const App = craftComponent(
  'App',
  {
    providers: [provideAppView(), provideDocModeView(), provideDocSeasonView()],
  },
  () =>
    div({ class: demoShell.root }, [
      skipLink('main', 'Skip to content'),
      div(
        'demo-banner',
        { class: demoShell.banner, 'data-testid': 'demo-banner' },
        [
          div({ class: demoShell.bannerMain }, [
            span({ class: badgeUi.root, 'data-tone': 'important' }, 'Beta'),
            strong({ class: demoShell.bannerStrong }, 'Demo'),
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
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-testid': 'nav-toggle',
            type: 'button',
            'aria-expanded': AppView.navOpen,
            keydown: handleNavToggleKeydown,
          },
          AppView.navToggleLabel,
        ).pipe(
          eventAction({
            click: { action: AppView.navOpen.toggle, stopPropagation: true },
          }),
        ),
        ifNode(
          'app-nav-panel-open',
          AppView.navOpen,
          () => div(
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
                          'data-testid': 'nav-link',
                          click: AppView.navOpen.close,
                          keydown: handleNavLinkKeydown,
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
        ),
        div({ class: demoShell.navTools }, [
          DocSeasonPicker({
            label: function* () {
              return 'Season';
            },
            menuId: function* () {
              return 'season-menu';
            },
            names: function* () {
              return defaultSeasonNames;
            },
          }),
          DocModeToggle({
            label: function* () {
              return 'Toggle light and dark';
            },
          }),
        ]),
      ]),
      main(
        { id: 'main', class: demoShell.content, tabIndex: -1 },
        CraftRouterOutlet(),
      ),
      div({ class: demoShell.clearCache }, [
        button(
          'clearCache',
          {
            class: buttonUi.root,
            'data-variant': 'danger',
            type: 'button',
            click: AppView.clearCache,
          },
          'Clear cache',
        ),
      ]),
    ]),
);
