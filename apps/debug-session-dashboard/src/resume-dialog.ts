import { i18n } from './i18n/catalog';
import {
  button,
  content,
  craftComponent,
  div,
  label,
  li,
  ol,
  p,
  textarea,
} from '@craft-ts/component';
import { craftComputed, rawReactiveValue } from '@craft-ts/core';
import { DocDialog } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { ReplayDebug } from './replay-debug';
import { parseLocalTarget } from './replay-model';
import { routeSessionId, ReplayState } from './replay-state';
import { ResumeRequest } from './resume-request.service';
import {
  SessionArchive,
  type ResumeCheckpointSummary,
  type ResumeRecipeSummary,
} from './session-archive.service';
import { recipeName } from './session-lineage';
import { eventValue, lit } from './view-helpers';

/** A point frozen for this very moment, on the app the dashboard drives. */
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

/** What already exists at this moment, said once so the agent's work is not redone blindly. */
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
    return i18n.t('existingCheckpoint', {
      deadline: until,
      recipeInfo,
    });
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
 * « Reprendre ici », asked properly: what the agent will do, what is already
 * there at this moment, and what the person wants from it — before a tab
 * opens and a prompt lands in the clipboard.
 */
export const ResumeDialog = craftComponent('ResumeDialog', {}, function* () {
  const replayDebug = yield* ReplayDebug();
  const replayState = yield* ReplayState();
  const { resumeDialogOpen, resumeIntent, setStates, targetUrl } =
    replayState.imperative;
  const { closeResumeDialog } = replayState;
  const archive = yield* SessionArchive();
  const request = yield* ResumeRequest();
  const resumeRecipes = rawReactiveValue(archive.resumeRecipeList);
  const resumeCheckpoints = rawReactiveValue(archive.resumeCheckpointList);
  const sending = rawReactiveValue(archive.resumeRequestSending);
  const failed = rawReactiveValue(archive.resumeRequestFailed);

  const momentText = yield* craftComputed('momentText', () => {
    const point = replayDebug.replayPoint();
    return point.beforeSequence === undefined
      ? i18n.t("copy.copy155")
      : (i18n.t("copy.copy156") + (point.beforeSequence) + i18n.t("copy.copy157"));
  });
  const existingText = yield* craftComputed('existingText', function* () {
    const before = replayDebug.replayPoint().beforeSequence;
    return existingAtMoment(
      readyCheckpointFor(resumeCheckpoints(), yield* targetUrl(), before),
      readyRecipesFor(resumeRecipes(), routeSessionId(), yield* targetUrl(), before),
    );
  });
  const existingValue = rawReactiveValue(existingText);
  const failedHidden = yield* craftComputed('failedHidden', () => !failed());
  const submitDisabled = yield* craftComputed(
    'submitDisabled',
    function* () {
      return (
        (yield* resumeIntent()).trim() === '' ||
        sending() ||
        !routeSessionId()
      );
    },
  );

  return DocDialog({
    heading: lit('Reprendre avec un agent IA'),
    dialogId: lit('resume-here'),
    open: resumeDialogOpen,
    dismiss: closeResumeDialog,
    body: content(() => [
      div({ class: ui.importFields }, [
        p({ class: ui.lede, 'data-lab': 'resume-moment' }, momentText),
        ol({ class: ui.howToSteps }, [
          li('Un onglet de l’application s’ouvre, réservé à l’agent.'),
          li(
            'Le prompt est copié : collez-le dans la conversation de votre agent (Claude Code…).',
          ),
          li(
            'L’agent rouvre ce moment avec de vraies données et laisse un point de reprise. Sa progression s’affiche dans « Reprises ».',
          ),
        ]),
        p(
          {
            class: ui.dialogNote,
            'data-lab': 'resume-existing',
            hidden: function* () {
              return existingValue() === '';
            },
          },
          existingText,
        ),
        label(
          { class: ui.fieldLabel, for: 'resume-intent' },
          i18n.t("copy.copy158"),
        ),
        textarea('resumeIntent', {
          id: 'resume-intent',
          'aria-label': i18n.t("copy.copy159"),
          class: ui.importText,
          rows: 4,
          placeholder:
            i18n.t("copy.copy160"),
          value: resumeIntent,
          input: (event: Event) => setStates({ resumeIntent: eventValue(event) }),
        }),
        p(
          {
            class: ui.importError,
            role: 'alert',
            hidden: failedHidden,
          },
          i18n.t("copy.copy161"),
        ),
        div({ class: ui.importActions }, [
          button(
            'cancelResume',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              click: closeResumeDialog,
            },
            i18n.t("copy.copy162"),
          ),
          button(
            'confirmResume',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'primary',
              'data-lab': 'confirm-resume',
              disabled: submitDisabled,
              click: request.submit,
            },
            i18n.t("copy.copy163"),
          ),
        ]),
      ]),
    ]),
  });
});
