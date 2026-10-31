import { button, craftComponent, div, heading, p } from '@craft-ts/component';
import {
  CraftActivatedRoute,
  CraftRouter,
  craftComputed,
  rawReactiveValue,
  state,
} from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { launchResumeRecipeTab } from './replay-debug';
import {
  httpFailureReason,
  SessionArchive,
  type ResumeRecipeDetail,
} from './session-archive.service';

function recipeValidationText(item: ResumeRecipeDetail | undefined): string {
  if (!item) return '';
  const label =
    item.validation.status === 'verified'
      ? 'Vérifiée'
      : item.validation.status === 'validation-failed'
        ? 'Prévalidation échouée'
        : 'Brouillon';
  const issues = [...item.validation.issues];
  const failure = item.runs[0]?.failure;
  if (failure) {
    const step = `Étape ${(failure.step ?? 0) + 1} : ${failure.detail}`;
    if (!issues.includes(step)) issues.push(step);
  }
  return issues.length ? `${label} · ${issues.join(' · ')}` : label;
}

function recipeSummaryHidden(item: ResumeRecipeDetail | undefined): boolean {
  return (
    !item ||
    (item.summary?.trim() || item.objective.goal) ===
      (item.name?.trim() || item.objective.goal)
  );
}

/** A focused recipe summary with only the actions needed to use it. */
export const RecipeDetailPage = craftComponent(
  'RecipeDetailPage',
  {},
  function* () {
    const route = yield* CraftActivatedRoute();
    const archive = yield* SessionArchive();
    const recipeId = route.snapshot.params['recipeId'];
    archive.recipeDetail.call(recipeId);

    const detailValue = rawReactiveValue(archive.resumeRecipeDetail);
    const detailFailure = rawReactiveValue(archive.recipeDetail.exception);
    const recipe = yield* craftComputed('recipe', () =>
      detailValue()?.id === recipeId ? detailValue() : undefined,
    );
    const recipeValue = rawReactiveValue(recipe);
    const feedback = yield* state(
      'feedback',
      '',
      function* ({ state: read, set }) {
        const setFeedback = (value: string) => set(value);
        return { setFeedback, message: read };
      },
    );
    const feedbackText = rawReactiveValue(feedback.message);
    const validationText = yield* craftComputed('validationText', () =>
      recipeValidationText(recipeValue()),
    );
    const loadMessage = yield* craftComputed('loadMessage', () =>
      !recipeId
        ? 'Identifiant de recette invalide.'
        : detailFailure()
          ? `Impossible de charger la recette · ${httpFailureReason(detailFailure())}`
          : 'Chargement de la recette…',
    );

    const launch = button(
      'launchRecipe',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'primary',
        'data-lab': 'launch-recipe',
        disabled: function* () {
          return recipeValue() === undefined;
        },
        click: function* () {
          const item = recipeValue();
          if (!item) return;
          const opened = launchResumeRecipeTab(item.id, item.origin);
          yield* feedback.setFeedback(
            opened
              ? 'La recette démarre dans un nouvel onglet.'
              : 'Impossible d’ouvrir la recette. Vérifie que son origine est locale et que les fenêtres surgissantes sont autorisées.',
          );
        },
      },
      'Prévalider dans un nouvel onglet',
    );

    const noRecipe = p(
      {
        class: ui.empty,
        role: 'status',
        hidden: function* () {
          return recipeValue() !== undefined;
        },
      },
      loadMessage,
    );

    const detail = div(
      {
        class: ui.recipeDetail,
        hidden: function* () {
          return recipeValue() === undefined;
        },
      },
      [
        div({ class: ui.gap }, [
          heading({ class: ui.headName }, function* () {
            const item = recipeValue();
            return item ? item.name?.trim() || item.objective.goal : '';
          }),
          p(
            {
              class: ui.lede,
            hidden: function* () {
              return recipeSummaryHidden(recipeValue());
            },
            },
            function* () {
              const item = recipeValue();
              return item?.summary?.trim() || item?.objective.goal || '';
            },
          ),
        ]),
        p(
          {
            class: ui.eventMeta,
            role: 'status',
            'data-lab': 'recipe-validation-status',
          },
          validationText,
        ),
        div(
          {
            role: 'status',
            hidden: function* () {
              return !feedbackText();
            },
          },
          div({ class: ui.eventMeta }, feedbackText),
        ),
        div({ class: ui.gapActions }, [
          launch,
          button(
            'refreshRecipeValidation',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              'data-lab': 'refresh-recipe-status',
              disabled: function* () {
                return recipeValue() === undefined;
              },
              click: function* () {
                const item = recipeValue();
                if (item) archive.recipeDetail.call(item.id);
              },
            },
            'Actualiser le statut',
          ),
          button(
            'openSourceSession',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              'data-lab': 'recipe-source-session',
              disabled: function* () {
                return recipeValue() === undefined;
              },
              click: function* () {
                const item = recipeValue();
                if (item) {
                  yield* CraftRouter.navigate({
                    to: 'sessions/:sessionId',
                    params: { sessionId: item.sessionId },
                  });
                }
              },
            },
            'Replay d’origine',
          ),
        ]),
      ],
    );

    return div({ class: ui.scroll }, [
      div({ class: ui.listPage }, [
        div({ class: ui.listHead }, [
          heading({ class: ui.title }, 'Recette'),
          button(
            'backToRecipeCatalog',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              click: function* () {
                yield* CraftRouter.navigate({ to: 'recipes' });
              },
            },
            '← Recettes',
          ),
        ]),
        noRecipe,
        detail,
      ]),
    ]);
  },
);
