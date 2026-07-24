import type { Router } from '@angular/router';
import {
  a,
  angular,
  button,
  component,
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
  CraftRouterOutlet,
  GlobalPersisterHandlerServiceToYield,
  provideHostName,
  type GetDeps,
} from '@craft-ng/core';

const LINKS = [
  ['Functional Components', '/'],
  ['Query', '/query/1'],
  ['Slow Page', '/slow-page'],
  ['View Transitions', '/view-transitions'],
  ['Mutation', '/mutation/1'],
  ['List with Pagination', '/list-with-pagination'],
  ['Granular Mutation', '/granular-mutation'],
  ['Full Demo', '/full-demo'],
  ['Pixel Art', '/pixel-art'],
  ['Pixel Art Matrix', '/pixel-art-matrix'],
  ['Exceptions', '/exceptions'],
  ['Login Form', '/login-form'],
  ['Exception QueryParams', '/exception-query-params'],
  ['Craft Query', '/craft/query/1'],
  ['Craft Mutation', '/craft/mutation/1'],
  ['Craft List Pagination', '/craft/list-with-pagination'],
  ['Craft Granular Mutation', '/craft/granular-mutation'],
  ['Craft Full Demo', '/craft/full-demo'],
  ['Craft Lazy Layout', '/craft/lazy-layout/100/users/42'],
  ['craftService Counter', '/craft-service/counter'],
  ['craftService User Detail', '/craft-service/user-detail'],
  ['Demo Send Context', '/demo-send-context'],
  ['Guard demo', '/guard-demo'],
] as const;

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
          { track: ([, href]) => href },
          ([label, href]) => a({ href }, label),
        ),
      ),
      main({ class: 'content' }, angular(CraftRouterOutlet)),
      button(
        { class: 'clear-cache-btn', click: () => void clearCache() },
        '🗑️ Clear Cache',
      ),
    ]),
);

export type GenDeps_App = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
  missingProvider: { Router: Router };
}>;
