import {
  button,
  component,
  div,
  h2,
  p,
} from '@craft-ng/component';
import {
  injectCraftRouteLoadError,
  injectCraftRouteLoadRecovery,
  provideHostName,
  type GetDeps,
} from '@craft-ng/core';

export const MyRouteLoadErrorScreen = component(
  {
    providers: [provideHostName('component:MyRouteLoadErrorScreen')],
    styles: `
      .route-load-error{padding:2rem;border:1px solid #f97316;border-radius:8px;background:#fff7ed;color:#9a3412}
      .route-load-error .actions{display:flex;gap:.75rem;margin-top:1rem}
    `,
  },
  () => ({
    error: injectCraftRouteLoadError(),
    recovery: injectCraftRouteLoadRecovery(),
  }),
  ({ error, recovery }) => {
    const current = error();
    const message = current
      ? `Failed to load ${current.payload.phase} for route "${current.payload.routePath}" after ${current.payload.attempt} attempts.`
      : 'The requested route chunk could not be loaded.';
    return div({ class: 'route-load-error' }, [
      h2('⚠️ Route chunk failed'),
      p(message),
      div({ class: 'actions' }, [
        button({ click: () => void recovery.retry() }, 'Retry route load'),
        button({ click: () => recovery.reload() }, 'Reload app'),
      ]),
    ]);
  },
);

export type GenDeps_MyRouteLoadErrorScreen = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
  missingProvider: {
    CraftRouteLoadError: ReturnType<typeof injectCraftRouteLoadError>;
    CraftRouteLoadRecovery: ReturnType<typeof injectCraftRouteLoadRecovery>;
  };
}>;
