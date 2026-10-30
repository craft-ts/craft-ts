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
import { rawReactiveValue } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { goToHash } from './replay-browser';
import {
  SessionArchive,
  type ResumeRecipeSummary,
} from './session-archive.service';

function recipeName(recipe: ResumeRecipeSummary): string {
  return recipe.name?.trim() || recipe.objective.goal;
}

function recipeDescription(recipe: ResumeRecipeSummary): string {
  return recipe.summary?.trim() || recipe.objective.goal;
}

/** Catalogue de toutes les recettes connues de l’archive locale. */
export const RecipesPage = craftComponent('RecipesPage', {}, function* () {
  const archive = yield* SessionArchive();
  const savedRecipes = rawReactiveValue(archive.resumeRecipeList);

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
              goToHash(`#/recipes/${encodeURIComponent(item.id)}`);
            },
          },
          [
            span({ class: ui.rowTitle }, function* () {
              return recipeName(yield* recipe());
            }),
            span(
              {
                class: ui.rowMeta,
                hidden: function* () {
                  const item = yield* recipe();
                  return recipeDescription(item) === recipeName(item);
                },
              },
              function* () {
                return recipeDescription(yield* recipe());
              },
            ),
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
    'Aucune recette enregistrée pour le moment.',
  );

  return div({ class: ui.scroll }, [
    div({ class: ui.listPage }, [
      div({ class: ui.listHead }, [
        heading({ class: ui.title }, 'Recettes'),
        div({ class: ui.gapActions }, [
          button(
            'backToSessions',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              click: () => goToHash('#/'),
            },
            '← Sessions',
          ),
        ]),
      ]),
      rows,
      empty,
    ]),
  ]);
});
