import { CraftRouter, craftService, craftExpose } from '@craft-ts/core';
import type { DevtoolView } from './devtool-view-state';

export const { ReviewNavigation, provideReviewNavigation } = craftService(
  { name: 'ReviewNavigation', providedIn: 'toProvide' },
  function* () {
    const router = yield* CraftRouter();

    yield* craftExpose('navigateToView', (value: DevtoolView) =>
      router.navigateByUrl(`/${value}?view=${value}`));
  },
);
