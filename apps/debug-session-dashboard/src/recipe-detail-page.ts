import { button, craftComponent, div, heading, p } from '@craft-ts/component';
import { craftComputed, rawReactiveValue, state } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { AiChatBridge } from './replay-ai-bridge.service';
import { ui } from './dashboard.style';
import { currentHash, goToHash } from './replay-browser';
import { launchResumeRecipeTab } from './replay-debug';
import { httpFailureReason, SessionArchive } from './session-archive.service';
import { sessionRoute } from './replay-state';

function recipeIdFromHash(): string | undefined {
  const prefix = '#/recipes/';
  const hash = currentHash();
  if (!hash.startsWith(prefix)) return undefined;
  const encoded = hash.slice(prefix.length).split(/[/?]/, 1)[0];
  if (!encoded) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

/** A focused recipe summary with only the actions needed to use it. */
export const RecipeDetailPage = craftComponent(
  'RecipeDetailPage',
  {},
  function* () {
    const archive = yield* SessionArchive();
    const aiChat = yield* AiChatBridge();
    const recipeId = recipeIdFromHash();
    if (recipeId) archive.recipeDetail.call(recipeId);

    const detailValue = rawReactiveValue(archive.resumeRecipeDetail);
    const detailFailure = rawReactiveValue(archive.recipeDetail.exception);
    const recipe = yield* craftComputed('selectedRecipe', () =>
      detailValue()?.id === recipeId ? detailValue() : undefined,
    );
    const recipeValue = rawReactiveValue(recipe);
    const aiChatDisabled = yield* craftComputed(
      'recipeDetailAiChatDisabled',
      function* () {
        return !(yield* aiChat.chat.available());
      },
    );
    const feedback = yield* state(
      'recipeLaunchFeedback',
      '',
      function* ({ state: read, set }) {
        const message = yield* craftComputed(
          'recipeLaunchMessage',
          function* () {
            return yield* read();
          },
        );
        return { set, message };
      },
    );
    const feedbackText = rawReactiveValue(feedback.message);
    const loadMessage = yield* craftComputed('recipeLoadMessage', () =>
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
          yield* feedback.set(
            opened
              ? 'La recette démarre dans un nouvel onglet.'
              : 'Impossible d’ouvrir la recette. Vérifie que son origine est locale et que les fenêtres surgissantes sont autorisées.',
          );
        },
      },
      'Lancer la recette',
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
                const item = recipeValue();
                if (!item) return true;
                return (
                  (item.summary?.trim() || item.objective.goal) ===
                  (item.name?.trim() || item.objective.goal)
                );
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
            hidden: function* () {
              return !feedbackText();
            },
          },
          feedbackText,
        ),
        div({ class: ui.gapActions }, [
          launch,
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
                if (item) goToHash(sessionRoute(item.sessionId));
              },
            },
            'Replay d’origine',
          ),
          button(
            'recipeDetailAiChat',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              'data-lab': 'ai-chat',
              disabled: aiChatDisabled,
              click: aiChat.open,
            },
            'Contexte IA',
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
              click: () => goToHash('#/recipes'),
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
