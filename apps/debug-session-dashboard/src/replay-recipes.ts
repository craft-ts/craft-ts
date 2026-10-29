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
import { craftComputed, rawReactiveValue } from '@craft-ts/core';
import { ui } from './dashboard.style';
import { goToHash } from './replay-browser';
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

/** Recettes enregistrées pour la session actuellement ouverte. */
export const ReplayRecipes = craftComponent('ReplayRecipes', {}, function* () {
  const archive = yield* SessionArchive();
  const savedRecipes = rawReactiveValue(archive.resumeRecipeList);
  const recipes = yield* craftComputed('sessionResumeRecipes', () => {
    const sessionId = routeSessionId();
    return sessionId
      ? savedRecipes().filter((recipe) => recipe.sessionId === sessionId)
      : [];
  });
  const recipesEmpty = yield* craftComputed(
    'resumeRecipesEmpty',
    () => recipes().length === 0,
  );

  return div({ class: ui.sideBody }, [
    div({ class: ui.scroll }, [
      heading({ class: ui.factLabel }, function* () {
        const count = recipes().length;
        return `${count} recette${count > 1 ? 's' : ''} pour cette session`;
      }),
      p(
        {
          class: ui.lede,
          hidden: yield* craftComputed('noRecipesHidden', () => !recipesEmpty()),
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
                  const item = yield* recipe();
                  goToHash(`#/recipes/${encodeURIComponent(item.id)}`);
                },
              },
              [
                div({ class: ui.eventInfo }, [
                  span({ class: ui.eventName }, function* () {
                    const item = yield* recipe();
                    return item.name?.trim() || item.objective.goal;
                  }),
                  span({ class: ui.eventMeta }, function* () {
                    const item = yield* recipe();
                    return item.summary?.trim() || item.objective.goal;
                  }),
                  span({ class: ui.eventMeta }, function* () {
                    const item = yield* recipe();
                    const latest = item.runs[0];
                    return [
                      item.strategy === 'autonomous'
                        ? 'Autonome'
                        : 'Donnée existante',
                      item.beforeSequence === undefined
                        ? 'toute la session'
                        : `événement ${item.beforeSequence}`,
                      `${item.runs.length} exécution(s)`,
                      ...(latest
                        ? [
                            `dernière ${RUN_STATUS[latest.status] ?? latest.status}`,
                          ]
                        : []),
                    ].join(' · ');
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
