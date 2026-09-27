import { CraftRouter, craftService } from '@craft-ts/core';
import type { DevtoolView } from './devtool-view-state';

export const { ReviewNavigation, provideReviewNavigation } = craftService(
  { name: 'ReviewNavigation', providedIn: 'toProvide' },
  function* () {
    const router = yield* CraftRouter();

    return {
      navigateToView: (value: DevtoolView) =>
        router.navigateByUrl(`/${value}?view=${value}`),
    };
  },
);
