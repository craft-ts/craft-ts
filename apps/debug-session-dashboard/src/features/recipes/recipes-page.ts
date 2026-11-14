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
import { CraftRouter } from '@craft-ts/core';
import { badgeUi } from '@craft-ts/ui/style';
import {
  SessionArchive,
  type ResumeRecipeSummary,
  type SessionSummary,
} from '../../shared/data-access/session-archive.service';
import { ui } from '../../shared/ui/dashboard.style';
import { i18n } from '../../shared/util/catalog';
import { sessionDate } from '../../shared/util/replay-labels';
import { plural } from '../../shared/util/replay-model';
import {
  RECIPE_RUN_STATUS,
  RECIPE_VALIDATION_LABEL,
  recipeName,
  recipeValidationTone,
} from '../../shared/util/session-lineage';

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
      ? i18n.t('recipeSessionOf', {
          date: sessionDate.format(new Date(source.createdAt)),
        })
      : i18n.t('recipeSessionDeleted'),
    ...(recipe.beforeSequence === undefined
      ? []
      : [i18n.t('momentBeforeEvent', { count: recipe.beforeSequence })]),
    plural(recipe.runs.length, 'exécution'),
    ...(latest
      ? [
          i18n.t('recipeLatestRun', {
            detail: RECIPE_RUN_STATUS[latest.status] ?? latest.status,
          }),
        ]
      : []),
  ].join(' · ');
}

/** Every recipe the local archive knows, newest first. */
export const RecipesPage = craftComponent('RecipesPage', {}, function* () {
  const archive = yield* SessionArchive();
  const savedRecipes = archive.recipeCatalog.resumeRecipeList;
  const savedSessions = archive.sessions.savedSessions;

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
              const _savedSessions = yield* savedSessions();
              return recipeFacts(yield* recipe(), _savedSessions);
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
        const _savedRecipes = yield* savedRecipes();
        return _savedRecipes.length > 0;
      },
    },
    i18n.t('copy.copy042'),
  );

  return div({ class: ui.scroll }, [
    div({ class: ui.listPage }, [
      div({ class: ui.listHead }, [
        div([
          heading({ class: ui.title }, i18n.t('copy.copy043')),
          p({ class: ui.lede }, i18n.t('copy.copy044')),
        ]),
      ]),
      rows,
      empty,
    ]),
  ]);
});
