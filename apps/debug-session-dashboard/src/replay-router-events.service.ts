import { CraftRouter, craftExpose, craftService } from '@craft-ts/core';

/** Bridges Craft navigation completion to the replay archive lifecycle. */
export const { ReplayRouterEvents, provideReplayRouterEvents } = craftService(
  { name: 'replayRouterEvents', providedIn: 'toProvide' },
  function* () {
    const router = yield* CraftRouter();
    yield* craftExpose(
      'onNavigationEnd',
      (run: () => void) =>
        router.events.subscribe((event) => {
          if (event.type === 'NavigationEnd') run();
        }),
    );
  },
);
