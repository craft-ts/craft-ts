import { craftComputed, craftExpose, craftService } from '@craft-ts/core';
import { newUuid } from '../../shared/util/replay-browser';
import { ReplayDebug } from '../../shared/state/replay-debug';
import {
  ReplayState,
  resumeIntent as resumeIntentValue,
  routeSessionId,
  targetUrl,
} from '../../shared/state/replay-state';
import { copyResumePrompt, resumePrompt } from './resume-prompt';
import { ResumeThread } from '../../shared/data-access/resume-thread.service';
import {
  SessionArchive,
  type ResumeCheckpointSummary,
  type ResumeRecipeSummary,
} from '../../shared/data-access/session-archive.service';
import { i18n } from '../../shared/util/catalog';
import { parseLocalTarget } from '../../shared/util/replay-model';
import { recipeName } from '../../shared/util/session-lineage';

function readyCheckpointFor(
  checkpoints: readonly ResumeCheckpointSummary[],
  target: string,
  beforeSequence: number | undefined,
): ResumeCheckpointSummary | undefined {
  const parsed = parseLocalTarget(target.trim());
  const origin = parsed.ok ? parsed.url.origin : undefined;
  return checkpoints.find(
    (checkpoint) =>
      !checkpoint.expired &&
      checkpoint.origin === origin &&
      checkpoint.beforeSequence === beforeSequence,
  );
}

function readyRecipesFor(
  recipes: readonly ResumeRecipeSummary[],
  sessionId: string | undefined,
  target: string,
  beforeSequence: number | undefined,
): readonly ResumeRecipeSummary[] {
  const parsed = parseLocalTarget(target.trim());
  if (!parsed.ok || !sessionId) return [];
  return recipes.filter(
    (recipe) =>
      recipe.sessionId === sessionId &&
      recipe.origin === parsed.url.origin &&
      recipe.beforeSequence === beforeSequence,
  );
}

function existingAtMoment(
  checkpoint: ResumeCheckpointSummary | undefined,
  recipes: readonly ResumeRecipeSummary[],
): string {
  const names = recipes.map((recipe) => `« ${recipeName(recipe)} »`).join(', ');
  if (checkpoint) {
    const until = new Date(checkpoint.expiresAt).toLocaleString('fr-FR');
    const recipeInfo = recipes.length
      ? i18n.t('checkpointRecipeInfo', {
          recipeInfo: `${recipes.length > 1 ? 'les recettes' : 'la recette'} ${names}`,
        })
      : '';
    return i18n.t('existingCheckpoint', { deadline: until, recipeInfo });
  }
  if (recipes.length) {
    return i18n.t('existingRecipes', {
      recipeAvailability:
        recipes.length > 1 ? 'Des recettes existent' : 'Une recette existe',
      recipeNames: names,
      replayPronoun: recipes.length > 1 ? 'les' : 'la',
    });
  }
  return '';
}

/**
 * « Reprendre ici », once the person said what it is for: the app tab opens
 * first (still inside the click, or the browser blocks it), the prompt goes to
 * the clipboard, the archive records the request, and the panel turns to the
 * « Reprises » view where the agent's progress shows.
 */
export const { ResumeRequest } = craftService(
  { name: 'resumeRequest', providedIn: 'global' },
  function* () {
    const replayDebug = yield* ReplayDebug();
    const { resumeDialogOpen, resumeIntent, sidePanelOpen, sideTab } =
      (yield* ReplayState()).imperative;
    const archive = yield* SessionArchive();
    const resumeThread = yield* ResumeThread();
    const recipes = archive.recipeCatalog.resumeRecipeList;
    const checkpoints = archive.resumeCheckpoints.resumeCheckpointList;
    const sending = archive.resumeRequest.resumeRequestSending;
    const failed = archive.resumeRequest.resumeRequestFailed;

    yield* craftComputed('momentText', () => {
      const point = replayDebug.replayPoint();
      return point.beforeSequence === undefined
        ? i18n.t('copy.copy155')
        : i18n.t('copy.copy156') + point.beforeSequence + i18n.t('copy.copy157');
    });
    yield* craftComputed('existingText', function* () {
      const before = replayDebug.replayPoint().beforeSequence;
      return existingAtMoment(
        readyCheckpointFor(yield* checkpoints(), targetUrl(), before),
        readyRecipesFor(yield* recipes(), routeSessionId(), targetUrl(), before),
      );
    });
    yield* craftComputed('failedHidden', function* () {
      return !(yield* failed());
    });
    yield* craftComputed('submitDisabled', function* () {
      return (
        (resumeIntentValue() ?? '').trim() === '' ||
        (yield* sending()) ||
        !routeSessionId()
      );
    });
    yield* craftExpose('close', function* () {
      yield* resumeDialogOpen.set(false);
    });
    yield* craftExpose('submit', function* () {
      const sessionId = routeSessionId();
      const intent = (yield* resumeIntent()).trim();
      if (sessionId === undefined || !intent) return;
      const point = replayDebug.replayPoint();
      const requestId = newUuid();
      const appTab = replayDebug.launchGuidedResumeTab(
        point.beforeSequence,
        point.participantId,
        requestId,
        sessionId,
      );
      const prompt = resumePrompt({
        sessionId,
        beforeSequence: point.beforeSequence,
        participantId: point.participantId,
        requestId,
        appUrl: appTab.url,
        intent,
      });
      yield* copyResumePrompt(prompt);
      const sent = yield* archive.requestResume(
        { sessionId, ...point },
        requestId,
        prompt,
        appTab.url,
        appTab.opened,
      );
      if (!sent) {
        appTab.tab?.close();
        return;
      }
      resumeThread.watchRequest(requestId);
      yield* resumeIntent.set('');
      yield* resumeDialogOpen.set(false);
      yield* sideTab.set('resumes');
      yield* sidePanelOpen.set(true);
    });
  },
);
