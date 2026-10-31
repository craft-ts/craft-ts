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
import { CraftRouter, craftComputed, rawReactiveValue } from '@craft-ts/core';
import { ui } from './dashboard.style';
import { routeSessionId } from './replay-state';
import { SessionArchive } from './session-archive.service';

const RUN_STATUS: Readonly<Record<string, string>> = {
  running: 'en cours',
  'waiting-human': 'à vous',
  'waiting-ai': 'en attente de l’IA',
  completed: 'terminée',
  failed: 'en échec',
  cancelled: 'annulée',
};

function recipeName<Recipe extends { name?: string; objective: { goal: string } }>(recipe: Recipe): string {
  return recipe.name?.trim() || recipe.objective.goal;
}

function recipeSummary<Recipe extends { summary?: string; objective: { goal: string } }>(recipe: Recipe): string {
  return recipe.summary?.trim() || recipe.objective.goal;
}

function recipeRunSummary<Recipe extends {
  strategy: string;
  beforeSequence?: number;
  runs: readonly { status: string }[];
}>(recipe: Recipe): string {
  const latest = recipe.runs[0];
  return [
    recipe.strategy === 'autonomous' ? 'Autonome' : 'Donnée existante',
    recipe.beforeSequence === undefined
      ? 'toute la session'
      : `événement ${recipe.beforeSequence}`,
    `${recipe.runs.length} exécution(s)`,
    ...(latest
      ? [`dernière ${RUN_STATUS[latest.status] ?? latest.status}`]
      : []),
  ].join(' · ');
}

/** Recettes enregistrées pour la session actuellement ouverte. */
export const ReplayRecipes = craftComponent('ReplayRecipes', {}, function* () {
  const archive = yield* SessionArchive();
  const savedRecipes = rawReactiveValue(archive.resumeRecipeList);
  const recipes = yield* craftComputed('recipes', () => {
    const sessionId = routeSessionId();
    return sessionId
      ? savedRecipes().filter((recipe) => recipe.sessionId === sessionId)
      : [];
  });
  const recipesEmpty = yield* craftComputed(
    'recipesEmpty',
    function* () {
      return (yield* recipes()).length === 0;
    },
  );
  const recipesHidden = yield* craftComputed('recipesHidden', function* () {
    return !(yield* recipesEmpty());
  });
  const recipeCountLabel = yield* craftComputed('recipeCountLabel', function* () {
    const count = (yield* recipes()).length;
    return `${count} recette${count > 1 ? 's' : ''} pour cette session`;
  });

  return div({ class: ui.sideBody }, [
    div({ class: ui.scroll }, [
      heading({ class: ui.factLabel }, recipeCountLabel),
      p(
        {
          class: ui.lede,
          hidden: recipesHidden,
        },
        'Aucune recette pour cette session.',
      ),
      ul(
        { class: ui.events, 'data-lab': 'resume-recipes' },
        forNode(recipes, { track: (recipe) => recipe.id }, (recipe) =>
          li(
            { class: ui.event },
            button(
              'openSessionRecipe',
              {
                type: 'button',
                class: ui.rowOpen,
                'data-lab': 'session-recipe',
                click: function* () {
                  yield* CraftRouter.navigate({
                    to: 'recipes/:recipeId',
                    params: { recipeId: (yield* recipe()).id },
                  });
                },
              },
              [
                div({ class: ui.eventInfo }, [
                  span({ class: ui.eventName }, function* () {
                    return recipeName(yield* recipe());
                  }),
                  span({ class: ui.eventMeta }, function* () {
                    return recipeSummary(yield* recipe());
                  }),
                  span({ class: ui.eventMeta }, function* () {
                    return recipeRunSummary(yield* recipe());
                  }),
                ]),
              ],
            ),
          ),
        ),
      ),
    ]),
  ]);
});
