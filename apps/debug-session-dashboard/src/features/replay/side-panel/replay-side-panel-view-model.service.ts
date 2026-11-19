import { craftComputed, craftService } from '@craft-ts/core';
import {
  SessionArchive,
  type ResumeCheckpointSummary,
  type ResumeRecipeSummary,
  type SessionSummary,
} from '../../../shared/data-access/session-archive.service';
import {
  eventTimelinePage,
  eventTimelinePageCount,
  isReplayErrorNote,
  pendingWarnings,
  replayDifferences,
  replayWarnings,
  routeSessionId,
  sidePanelOpen,
  sideTab,
} from '../../../shared/state/replay-state';
import { i18n } from '../../../shared/util/catalog';
import { journalSummary } from '../../../shared/util/replay-labels';
import { derivedSessionsOf } from '../../../shared/util/session-lineage';
import type { SideTab } from '../../../shared/state/replay-state';

const TAB_TITLES: Readonly<Record<SideTab, string>> = {
  journal: i18n.t('tabJournalTitle'),
  review: i18n.t('tabReviewTitle'),
  resumes: i18n.t('tabResumesTitle'),
  details: i18n.t('tabDetailsTitle'),
};

function resumeItemCount(
  sessionId: string | undefined,
  checkpoints: readonly ResumeCheckpointSummary[],
  recipes: readonly ResumeRecipeSummary[],
  sessions: readonly SessionSummary[],
): number {
  if (!sessionId) return 0;
  return (
    checkpoints.filter((checkpoint) => !checkpoint.expired).length +
    recipes.filter((recipe) => recipe.sessionId === sessionId).length +
    derivedSessionsOf(sessionId, sessions, recipes).length
  );
}

export const { ReplaySidePanelViewModel } = craftService(
  { name: 'replaySidePanelViewModel', providedIn: 'global' },
  function* () {
    const archive = yield* SessionArchive();
    const savedSessions = archive.sessions.savedSessions;
    const savedRecipes = archive.recipeCatalog.resumeRecipeList;
    const checkpoints = archive.resumeCheckpoints.resumeCheckpointList;

    yield* craftComputed('panelClosed', () => !sidePanelOpen());
    yield* craftComputed('panelTitle', () => TAB_TITLES[sideTab()]);
    yield* craftComputed(
      'reviewCount',
      () => replayDifferences().length + replayWarnings().length,
    );
    yield* craftComputed(
      'reviewAlert',
      () =>
        replayDifferences().length > 0 ||
        pendingWarnings().length > 0 ||
        replayWarnings().some(isReplayErrorNote),
    );
    yield* craftComputed('resumeCount', function* () {
      return resumeItemCount(
        routeSessionId(),
        yield* checkpoints(),
        yield* savedRecipes(),
        yield* savedSessions(),
      );
    });
    yield* craftComputed('journalSummaryText', journalSummary);
    yield* craftComputed('pagerHidden', () => eventTimelinePageCount() <= 1);
    yield* craftComputed('previousDisabled', () => eventTimelinePage() === 0);
    yield* craftComputed(
      'pageLabel',
      () => `${eventTimelinePage() + 1} / ${eventTimelinePageCount()}`,
    );
    yield* craftComputed(
      'nextDisabled',
      () => eventTimelinePage() + 1 >= eventTimelinePageCount(),
    );
  },
);
