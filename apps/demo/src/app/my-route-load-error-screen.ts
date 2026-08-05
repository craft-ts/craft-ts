import { button, craftComponent, div, h2, p } from '@craft-ng/component';
import {
  CraftRouteLoadError,
  CraftRouteLoadRecovery,
} from '@craft-ng/core';

export const MyRouteLoadErrorScreen = craftComponent(
  'MyRouteLoadErrorScreen',
  {
    styles: `
      :scope{padding:2rem;border:1px solid #f97316;border-radius:8px;background:#fff7ed;color:#9a3412}
      .actions{display:flex;gap:.75rem;margin-top:1rem}
    `,
  },
  function* () {
    return {
      error: yield* CraftRouteLoadError(),
      recovery: yield* CraftRouteLoadRecovery(),
    };
  },
  ({ error, recovery }) => {
    const current = error();
    const message = current
      ? `Failed to load ${current.payload.phase} for route "${current.payload.routePath}" after ${current.payload.attempt} attempts.`
      : 'The requested route chunk could not be loaded.';
    return div([
      h2('⚠️ Route chunk failed'),
      p(message),
      div({ class: 'actions' }, [
        button({ click: () => void recovery.retry() }, 'Retry route load'),
        button({ click: () => recovery.reload() }, 'Reload app'),
      ]),
    ]);
  },
);
