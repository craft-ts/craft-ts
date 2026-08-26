/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  button,
  craftComponent,
  div,
  p,
  heading,
} from '@craft-ts/component';
import {
  craftComputed,
  CraftRouteLoadError,
  CraftRouteLoadRecovery,
} from '@craft-ts/core';

export const MyRouteLoadErrorScreen = craftComponent(
  'MyRouteLoadErrorScreen',
  {
    styles: `
      :scope{padding:2rem;border:1px solid #f97316;border-radius:8px;background:#fff7ed;color:#9a3412}
      .actions{display:flex;gap:.75rem;margin-top:1rem}
    `,
  },
  function* () {
    const error = yield* CraftRouteLoadError();
    const message = craftComputed('message', () => {
      const current = error();
      return current
        ? `Failed to load ${current.payload.phase} for route "${current.payload.routePath}" after ${current.payload.attempt} attempts.`
        : 'The requested route chunk could not be loaded.';
    }) as unknown as () => string;
    return {
      error,
      message,
      recovery: yield* CraftRouteLoadRecovery(),
    };
  },
  ({ message, recovery }) => {
    return div([
      heading('⚠️ Route chunk failed'),
      p(() => message()),
      div({ class: 'actions' }, [
        button('retry', { type: 'button', click: () => void recovery.retry() }, 'Retry route load'),
        button('reload', { type: 'button', click: recovery.reload }, 'Reload app'),
      ]),
    ]);
  },
);
