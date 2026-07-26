import {
  a,
  button,
  component,
  CraftRouterOutlet,
  directive,
  div,
  each,
  main,
  nav,
} from '@craft-ng/component';
import {
  BrowserLocation,
  BrowserWindow,
  componentMonitoring,
  craftMethod,
  CraftRouterLink,
  GlobalPersisterHandlerServiceToYield,
  provideHostName,
  type CraftRouterLinkInput,
} from '@craft-ng/core';

const LINKS = [
  ['Functional Components', { to: '' }],
  ['Query', { to: 'query/:userId', params: { userId: '1' } }],
  ['Slow Page', { to: 'slow-page' }],
  ['View Transitions', { to: 'view-transitions' }],
  ['Mutation', { to: 'mutation/:userId', params: { userId: '1' } }],
  ['List with Pagination', { to: 'list-with-pagination' }],
  ['Granular Mutation', { to: 'granular-mutation' }],
  ['Full Demo', { to: 'full-demo' }],
  ['Pixel Art', { to: 'pixel-art' }],
  ['Pixel Art Matrix', { to: 'pixel-art-matrix' }],
  ['Exceptions', { to: 'exceptions' }],
  ['Login Form', { to: 'login-form' }],
  ['Exception QueryParams', { to: 'exception-query-params' }],
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
  ['craftService User Detail', { to: 'craft-service/user-detail' }],
  ['Demo Send Context', { to: 'demo-send-context' }],
  ['Guard demo', { to: 'guard-demo' }],
] as const satisfies readonly (readonly [string, CraftRouterLinkInput])[];

export const App = component(
  {
    providers: [provideHostName('component:App')],
    styles: `
      .app-container{display:flex;flex-direction:column;height:100vh;background:#fafafa}.tabs{display:flex;gap:.25rem;background:#fff;padding:1rem 1.5rem 0;border-bottom:1px solid #e5e7eb;overflow-x:auto}
      .tabs a{padding:.875rem 1.25rem;text-decoration:none;color:#6b7280;white-space:nowrap;font-weight:600}.tabs a:hover{color:#111827;background:#f9fafb}
      .content{flex:1;overflow:auto;padding:2rem;background:#fff;margin:1.5rem;border-radius:8px}.clear-cache-btn{position:fixed;bottom:2rem;right:2rem;padding:1rem 1.5rem;background:#374151;color:#fff;border:0;border-radius:50px;cursor:pointer}
    `,
  },
  () => {
    componentMonitoring();
    const clearCache = craftMethod('clearCache', function* () {
      const persister = yield* GlobalPersisterHandlerServiceToYield(
        undefined,
        ({ clearAllCache }) => ({ clearAllCache }),
      );
      persister.clearAllCache();
      yield* BrowserWindow.alert('Cache cleared! The page will reload.');
      yield* BrowserLocation.reload();
    });
    return { clearCache };
  },
  ({ clearCache }) =>
    div({ class: 'app-container' }, [
      nav(
        { class: 'tabs' },
        each(
          LINKS,
          { track: ([, link]) => link.to },
          ([label, link]) =>
            a(
              {
                directives: [
                  directive(CraftRouterLink, {
                    inputs: { craftRouterLink: link },
                  }),
                ],
              },
              label,
            ),
        ),
      ),
      main({ class: 'content' }, CraftRouterOutlet()),
      button(
        { class: 'clear-cache-btn', click: () => void clearCache() },
        '🗑️ Clear Cache',
      ),
    ]),
);
