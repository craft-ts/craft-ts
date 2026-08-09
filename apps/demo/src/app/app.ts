import {
  a,
  button,
  craftComponent,
  CraftRouterOutlet,
  directive,
  div,
  each,
  ifBlock,
  main,
  nav,
  strong,
} from '@craft-ng/component';
import {
  BrowserLocation,
  BrowserWindow,
  craftMethod,
  CraftRouterLink,
  GlobalPersisterHandlerService,
  type CraftRouterLinkInput,
  state,
} from '@craft-ng/core';
import { demoEnabledRoutePaths } from './app.routes.runtime';

const NAV_GROUPS = [
  {
    label: 'Components',
    links: [
      ['Functional Components', { to: '' }],
      ['Reactive Composition', { to: 'component-composition' }],
      ['Content Projection', { to: 'content-projection' }],
    ],
  },
  {
    label: 'Primitives',
    links: [
      ['Query', { to: 'query/:userId', params: { userId: '1' } }],
      ['Debounced Web Search', { to: 'debounced-web-search' }],
      ['Mutation', { to: 'mutation/:userId', params: { userId: '1' } }],
      ['List Pagination', { to: 'list-with-pagination' }],
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
  links: group.links.filter(([, link]) => demoEnabledRoutePaths.has(link.to)),
})).filter((group) => group.links.length > 0);

const craftRouterLink = ({ link }: { link: CraftRouterLinkInput }) =>
  directive(CraftRouterLink, {
    inputs: { craftRouterLink: link },
  });

export const App = craftComponent(
  'App',
  {
    styles: `
      :scope{display:flex;flex-direction:column;height:100vh;background:#fafafa}
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
      toggleNav: navOpen.toggle,
      closeNav: navOpen.close,
    };
  },
  ({ clearCache, navOpen, toggleNav, closeNav }) =>
    div([
      nav({ class: 'demo-nav' }, [
        button(
          {
            class: 'demo-nav__toggle',
            type: 'button',
            click: toggleNav,
            'aria-expanded': navOpen,
          },
          ifBlock(
            navOpen,
            () => 'Fermer les exemples',
            () => 'Parcourir les exemples',
          ),
        ),
        ifBlock(
          navOpen,
          () =>
            div(
              { class: 'demo-nav__panel' },
              each(
                VISIBLE_NAV_GROUPS,
                { track: (group) => group.label },
                (group) =>
                  div({ class: 'demo-nav__group' }, [
                    strong(group.label),
                    div(
                      { class: 'demo-nav__links' },
                      each(
                        group.links,
                        { track: ([, link]) => link.to },
                        ([label, link]) =>
                          a({ click: closeNav }, label).pipe(
                            craftRouterLink({ link }),
                          ),
                      ),
                    ),
                  ]),
              ),
            ),
          () => [],
        ),
      ]),
      main({ class: 'content' }, CraftRouterOutlet()),
      button(
        {
          class: 'clear-cache-btn',
          *click() {
            yield* clearCache();
          },
        },
        '🗑️ Clear Cache',
      ),
    ]),
);
