import { button, craftComponent, div, p, heading } from '@craft-ts/component';
import {
  craftService,
  craftMethod,
  craftComputed,
  CraftRouteLoadError,
  CraftRouteLoadRecovery,
  craftExpose,
} from '@craft-ts/core';
import { example } from './examples/shared/example.style';

export const { MyRouteLoadErrorScreenView, provideMyRouteLoadErrorScreenView } =
  craftService(
    { name: 'myRouteLoadErrorScreenView', providedIn: 'toProvide' },
    function* () {
      const error = yield* CraftRouteLoadError();
      const recovery = yield* CraftRouteLoadRecovery();
      yield* craftComputed('message', () => {
        const current = error();
        return current
          ? `Failed to load ${current.payload.phase} for route "${current.payload.routePath}" after ${current.payload.attempt} attempts.`
          : 'The requested route chunk could not be loaded.';
      });
      yield* craftExpose('error', error);
      yield* craftExpose('recovery', recovery);
      yield* craftMethod('retry', function* () {
        void recovery.retry();
      });
    },
  );

export const MyRouteLoadErrorScreen = craftComponent(
  'MyRouteLoadErrorScreen',
  {
    providers: [provideMyRouteLoadErrorScreenView()],
  },
  () =>
    div({ class: example.alert, 'data-exampleAlert': 'warning' }, [
      heading({ class: example.subtitle }, '⚠️ Route chunk failed'),
      p(MyRouteLoadErrorScreenView.message),
      div({ class: example.row }, [
        button(
          'retry',
          {
            class: example.button,
            type: 'button',
            click: MyRouteLoadErrorScreenView.retry,
          },
          'Retry route load',
        ),
        button(
          'reload',
          {
            class: example.button,
            type: 'button',
            click: MyRouteLoadErrorScreenView.recovery.reload,
          },
          'Reload app',
        ),
      ]),
    ]),
);
