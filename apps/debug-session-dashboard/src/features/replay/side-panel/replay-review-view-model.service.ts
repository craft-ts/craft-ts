import { craftComputed, craftService } from '@craft-ts/core';
import {
  autoSkipDifferences,
  replayDifferences,
  replayWarnings,
} from '../../../shared/state/replay-state';
import { i18n } from '../../../shared/util/catalog';

export const { ReplayReviewViewModel } = craftService(
  { name: 'replayReviewViewModel', providedIn: 'global' },
  function* () {
    yield* craftComputed(
      'nothingHidden',
      () => replayDifferences().length > 0 || replayWarnings().length > 0,
    );
    yield* craftComputed('differenceTitle', () =>
      replayDifferences().length > 1
        ? i18n.t('copy.copy109') + replayDifferences().length + i18n.t('copy.copy110')
        : i18n.t('copy.copy111'),
    );
    yield* craftComputed('notesTitle', () =>
      replayWarnings().length > 1
        ? i18n.t('copy.copy112') + replayWarnings().length + i18n.t('copy.copy113')
        : i18n.t('copy.copy114'),
    );
    yield* craftComputed(
      'differencesHidden',
      () => replayDifferences().length === 0,
    );
    yield* craftComputed('autoSkipHidden', () => !autoSkipDifferences());
    yield* craftComputed('notesHidden', () => replayWarnings().length === 0);
    yield* craftComputed('warningHistory', () => [...replayWarnings()].reverse());
  },
);
