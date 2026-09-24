import { button, craftComponent, div, p, heading } from '@craft-ts/component';
import {
  craftComputed,
  CraftRouteLoadError,
  CraftRouteLoadRecovery,
} from '@craft-ts/core';
import { example } from './examples/shared/example.style';

export const MyRouteLoadErrorScreen = craftComponent(
  'MyRouteLoadErrorScreen',
  {},
  function* () {
    const error = yield* CraftRouteLoadError();
    const message = craftComputed('message', () => {
      const current = error();
      return current
        ? `Failed to load ${current.payload.phase} for route "${current.payload.routePath}" after ${current.payload.attempt} attempts.`
        : 'The requested route chunk could not be loaded.';
    });
    return {
      error,
      message,
      recovery: yield* CraftRouteLoadRecovery(),
    };
  },
  ({ message, recovery }) => {
    return div({ class: example.alert, 'data-exampleAlert': 'warning' }, [
      heading({ class: example.subtitle }, '⚠️ Route chunk failed'),
      p(message),
      div({ class: example.row }, [
        button(
          'retry',
          {
            class: example.button,
            type: 'button',
            click: () => void recovery.retry(),
          },
          'Retry route load',
        ),
        button(
          'reload',
          { class: example.button, type: 'button', click: recovery.reload },
          'Reload app',
        ),
      ]),
    ]);
  },
);
