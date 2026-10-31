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
import { replayPoint } from './replay-debug';
import { parseLocalTarget } from './replay-model';
import {
  resumeDialogOpen,
  resumeIntent,
  routeSessionId,
  targetUrl,
} from './replay-state';
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
    return `Un point de reprise existe déjà à ce moment, valable jusqu’au ${until}${recipes.length ? `, avec ${recipes.length > 1 ? 'les recettes' : 'la recette'} ${names}` : ''}. L’agent le réutilisera s’il convient.`;
  }
  if (recipes.length) {
    return `${recipes.length > 1 ? 'Des recettes existent' : 'Une recette existe'} déjà à ce moment : ${names}. L’agent pourra ${recipes.length > 1 ? 'les' : 'la'} rejouer.`;
  }
  return '';
}

/** Closed without asking anything: what was typed stays for next time. */
function closeResumeDialog(): void {
  resumeDialogOpen.set(false);
}

/**
 * « Reprendre ici », asked properly: what the agent will do, what is already
 * there at this moment, and what the person wants from it — before a tab
 * opens and a prompt lands in the clipboard.
 */
export const ResumeDialog = craftComponent('ResumeDialog', {}, function* () {
  const archive = yield* SessionArchive();
  const request = yield* ResumeRequest();
  const resumeRecipes = rawReactiveValue(archive.resumeRecipeList);
  const resumeCheckpoints = rawReactiveValue(archive.resumeCheckpointList);
  const sending = rawReactiveValue(archive.resumeRequestSending);
  const failed = rawReactiveValue(archive.resumeRequestFailed);

  const momentText = yield* craftComputed('momentText', () => {
    const point = replayPoint();
    return point.beforeSequence === undefined
      ? 'Le replay est à la fin de l’enregistrement : l’agent reprendra l’application dans cet état final.'
      : `Le replay est juste avant l’événement ${point.beforeSequence} : l’agent reprendra l’application à ce moment précis.`;
  });
  const existingText = yield* craftComputed('existingText', () => {
    const before = replayPoint().beforeSequence;
    return existingAtMoment(
      readyCheckpointFor(resumeCheckpoints(), targetUrl(), before),
      readyRecipesFor(resumeRecipes(), routeSessionId(), targetUrl(), before),
    );
  });
  const existingValue = rawReactiveValue(existingText);
  const failedHidden = yield* craftComputed('failedHidden', () => !failed());
  const submitDisabled = yield* craftComputed(
    'submitDisabled',
    () => resumeIntent().trim() === '' || sending() || !routeSessionId(),
  );

  return DocDialog({
    heading: lit('Reprendre avec un agent IA'),
    dialogId: lit('resume-here'),
    open: function* () {
      return resumeDialogOpen();
    },
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
          'Que voulez-vous observer ou vérifier ?',
        ),
        textarea('resumeIntent', {
          id: 'resume-intent',
          'aria-label': 'Que voulez-vous observer ou vérifier ?',
          class: ui.importText,
          rows: 4,
          placeholder:
            'Ex. : retrouver le panier avec un produit épuisé pour vérifier le message d’erreur, sans écrire sur le serveur.',
          value: resumeIntent,
          input: (event: Event) => resumeIntent.set(eventValue(event)),
        }),
        p(
          {
            class: ui.importError,
            role: 'alert',
            hidden: failedHidden,
          },
          'L’archive locale n’a pas reçu la demande. Vérifiez que npm run logs:server tourne, puis réessayez.',
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
            'Annuler',
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
            'Ouvrir l’onglet et copier le prompt',
          ),
        ]),
      ]),
    ]),
  });
});
