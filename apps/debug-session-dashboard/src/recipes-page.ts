import {
  button,
  craftComponent,
  div,
  forNode,
  heading,
  li,
  p,
  span,
  ul,
} from '@craft-ts/component';
import { CraftRouter, rawReactiveValue } from '@craft-ts/core';
import { badgeUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { sessionDate } from './replay-labels';
import { plural } from './replay-model';
import {
  SessionArchive,
  type ResumeRecipeSummary,
  type SessionSummary,
} from './session-archive.service';
import {
  RECIPE_RUN_STATUS,
  RECIPE_VALIDATION_LABEL,
  recipeName,
  recipeValidationTone,
} from './session-lineage';

function recipeDescription(recipe: ResumeRecipeSummary): string {
  return recipe.summary?.trim() || recipe.objective.goal;
}

/** Where it comes from and how it went, on one line. */
function recipeFacts(
  recipe: ResumeRecipeSummary,
  sessions: readonly SessionSummary[],
): string {
  const source = sessions.find((session) => session.id === recipe.sessionId);
  const latest = recipe.runs[0];
  return [
    source
      ? `Session du ${sessionDate.format(new Date(source.createdAt))}`
      : 'Session supprimée',
    ...(recipe.beforeSequence === undefined
      ? []
      : [`avant l’événement ${recipe.beforeSequence}`]),
    plural(recipe.runs.length, 'exécution'),
    ...(latest
      ? [`dernière ${RECIPE_RUN_STATUS[latest.status] ?? latest.status}`]
      : []),
  ].join(' · ');
}

/** Every recipe the local archive knows, newest first. */
export const RecipesPage = craftComponent('RecipesPage', {}, function* () {
  const archive = yield* SessionArchive();
  const savedRecipes = rawReactiveValue(archive.resumeRecipeList);
  const savedSessions = rawReactiveValue(archive.savedSessions);

  const rows = ul(
    { class: ui.sessions, 'data-lab': 'recipe-catalog' },
    forNode(savedRecipes, { track: (recipe) => recipe.id }, (recipe) =>
      li(
        { class: ui.row },
        button(
          'openRecipeDetail',
          {
            type: 'button',
            class: ui.rowOpen,
            'data-lab': 'recipe-card',
            click: function* () {
              const item = yield* recipe();
              yield* CraftRouter.navigate({
                to: 'recipes/:recipeId',
                params: { recipeId: item.id },
              });
            },
          },
          [
            span({ class: ui.rowTitle }, [
              span(function* () {
                const recipeItem = yield* recipe();
                return recipeName(recipeItem);
              }),
              span(
                {
                  class: badgeUi.root,
                  'data-lab': 'recipe-validation-status',
                  'data-tone': function* () {
                    const recipeItem = yield* recipe();
                    return recipeValidationTone(recipeItem.validation.status);
                  },
                },
                function* () {
                  const recipeItem = yield* recipe();
                  return RECIPE_VALIDATION_LABEL[recipeItem.validation.status];
                },
              ),
            ]),
            span(
              {
                class: ui.rowMeta,
                hidden: function* () {
                  const item = yield* recipe();
                  return recipeDescription(item) === recipeName(item);
                },
              },
              function* () {
                const recipeItem = yield* recipe();
                return recipeDescription(recipeItem);
              },
            ),
            span({ class: ui.rowLineage }, function* () {
              return recipeFacts(yield* recipe(), savedSessions());
            }),
          ],
        ),
      ),
    ),
  );

  const empty = p(
    {
      class: ui.empty,
      'data-lab': 'empty-recipes',
      hidden: function* () {
        return savedRecipes().length > 0;
      },
    },
    'Aucune recette pour le moment. Elles naissent d’une reprise guidée : ouvrez une session, placez le replay au bon moment et choisissez « Reprendre ici ».',
  );

  return div({ class: ui.scroll }, [
    div({ class: ui.listPage }, [
      div({ class: ui.listHead }, [
        div([
          heading({ class: ui.title }, 'Recettes'),
          p(
            { class: ui.lede },
            'Les étapes qu’un agent a écrites pour ramener l’application à un moment d’une session. Une recette se prévalide dans un onglet neuf et devient « Vérifiée » quand ses attentes passent.',
          ),
        ]),
      ]),
      rows,
      empty,
    ]),
  ]);
});
