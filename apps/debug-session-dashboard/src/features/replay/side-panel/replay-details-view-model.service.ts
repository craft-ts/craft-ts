import { craftComputed, craftService } from '@craft-ts/core';
import {
  environmentWarning,
  session,
} from '../../../shared/state/replay-state';
import {
  recordingCaption,
  viewportCaption,
} from '../../../shared/util/replay-labels';
import { i18n } from '../../../shared/util/catalog';

/** Reactive labels shown beside the replay controls. */
export const { ReplayDetailsViewModel } = craftService(
  { name: 'replayDetailsViewModel', providedIn: 'global' },
  function* () {
    yield* craftComputed(
      'environmentWarningHidden',
      () => !environmentWarning(),
    );
    yield* craftComputed(
      'sessionStartUrl',
      () => session()?.startUrl ?? i18n.t('copy.copy045'),
    );
    yield* craftComputed('recordingLabel', recordingCaption);
    yield* craftComputed('viewportLabel', viewportCaption);
  },
);
