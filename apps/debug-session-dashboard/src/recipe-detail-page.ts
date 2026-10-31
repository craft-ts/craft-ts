import {
  button,
  content,
  craftComponent,
  div,
  forNode,
  heading,
  li,
  ol,
  p,
  span,
  ul,
} from '@craft-ts/component';
import {
  CraftActivatedRoute,
  CraftRouter,
  craftComputed,
  rawReactiveValue,
  state,
} from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { launchResumeRecipeTab } from './replay-debug';
import { sessionDate } from './replay-labels';
import { isRecord, plural } from './replay-model';
import {
  httpFailureReason,
  SessionArchive,
  type ResumeRecipeDetail,
  type ResumeRecipeRunSummary,
  type SessionSummary,
} from './session-archive.service';
import {
  RECIPE_RUN_STATUS,
  RECIPE_VALIDATION_LABEL,
  recipeName,
  recipeValidationTone,
} from './session-lineage';
import { lit } from './view-helpers';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** A recorded condition, as a person would say it. */
function conditionText(condition: unknown): string {
  if (!isRecord(condition)) return JSON.stringify(condition);
  if (typeof condition['visibleText'] === 'string')
    return `le texte « ${condition['visibleText']} » est visible`;
  if (typeof condition['route'] === 'string')
    return `la page est ${condition['route']}`;
  return JSON.stringify(condition);
}

/** One step of a recipe, in a sentence. Unknown kinds keep their raw shape. */
function stepText(step: Readonly<Record<string, unknown>>): string {
  const type = step['type'];
  if (type === 'network')
    return step['mode'] === 'mocked'
      ? 'Réseau simulé : aucune écriture sur le serveur.'
      : 'Réseau réel.';
  if (type === 'goto' && typeof step['route'] === 'string')
    return `Aller sur ${step['route']}.`;
  if (type === 'handoff')
    return `À vous : ${typeof step['message'] === 'string' ? step['message'] : 'une action manuelle.'}`;
  if (type === 'expect')
    return `Vérifier que ${conditionText(step['condition'])}${step['level'] === 'essential' ? ' (indispensable)' : ''}.`;
  if (type === 'checkpoint') return 'Figer un point de reprise à cet état.';
  const { type: _type, ...rest } = step;
  return `${String(type)} ${JSON.stringify(rest)}`;
}

function runText(run: ResumeRecipeRunSummary): string {
  return [
    dateTime.format(new Date(run.startedAt)),
    RECIPE_RUN_STATUS[run.status] ?? run.status,
    ...(run.currentStep === undefined ? [] : [`étape ${run.currentStep + 1}`]),
    ...(run.failure ? [run.failure.detail] : []),
  ].join(' · ');
}

function validationIssues(item: ResumeRecipeDetail | undefined): string {
  if (!item) return '';
  const issues = [...item.validation.issues];
  const failure = item.runs[0]?.failure;
  if (failure) {
    // The archive often repeats the failure as an issue: name its step instead.
    const step = `Étape ${(failure.step ?? 0) + 1} : ${failure.detail}`;
    const repeated = issues.indexOf(failure.detail);
    if (repeated >= 0) issues[repeated] = step;
    else if (!issues.includes(step)) issues.push(step);
  }
  return issues.join(' · ');
}

/** What the recipe may touch, and where its data comes from. */
function recipeBoundaries(item: ResumeRecipeDetail | undefined): string {
  if (!item) return '';
  return [
    item.objective.mayWrite
      ? 'Peut écrire sur le serveur'
      : 'N’écrit jamais sur le serveur',
    item.strategy === 'autonomous'
      ? 'recrée ses données elle-même'
      : 'part de données existantes',
  ].join(' · ');
}

/** The session and the moment the recipe brings back. */
function recipeOrigin(
  item: ResumeRecipeDetail | undefined,
  source: SessionSummary | undefined,
): string {
  if (!item) return '';
  const moment =
    item.beforeSequence === undefined
      ? 'à la fin de l’enregistrement'
      : `juste avant l’événement ${item.beforeSequence}`;
  return source
    ? `Session du ${sessionDate.format(new Date(source.createdAt))}, ${moment}.`
    : `Une session qui n’est plus dans l’archive, ${moment}.`;
}

/** One recipe: what it is for, what it does, how its runs went, and where it comes from. */
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
    const savedSessions = rawReactiveValue(archive.savedSessions);
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
    const loadMessage = yield* craftComputed('loadMessage', () =>
      !recipeId
        ? 'Identifiant de recette invalide.'
        : detailFailure()
          ? `Impossible de charger la recette · ${httpFailureReason(detailFailure())}`
          : 'Chargement de la recette…',
    );
    const steps = yield* craftComputed(
      'steps',
      () =>
        recipeValue()?.steps.map((step, index) => ({
          index,
          text: stepText(step),
        })) ?? [],
    );
    const runs = yield* craftComputed('runs', () => recipeValue()?.runs ?? []);
    const recordedSessions = yield* craftComputed('recordedSessions', () =>
      savedSessions().filter(
        (session) =>
          session.resume?.kind === 'recipe-run' &&
          session.resume.recipeId === recipeId,
      ),
    );
    const recordedValue = rawReactiveValue(recordedSessions);
    const source = yield* craftComputed('source', () =>
      savedSessions().find(
        (session) => session.id === recipeValue()?.sessionId,
      ),
    );
    const sourceValue = rawReactiveValue(source);

    const launch = button(
      'launchRecipe',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'primary',
        'data-lab': 'launch-recipe',
        'data-tooltip':
          'Ouvre un onglet neuf de l’application et y joue la recette ; son statut se met à jour à la fin.',
        disabled: function* () {
          return recipeValue() === undefined;
        },
        click: function* () {
          const item = recipeValue();
          if (!item) return;
          const opened = launchResumeRecipeTab(item.id, item.origin);
          yield* feedback.setFeedback(
            opened
              ? 'La recette tourne dans un nouvel onglet. Actualisez le statut quand elle a fini.'
              : 'Impossible d’ouvrir la recette. Vérifiez que son origine est locale et que les fenêtres surgissantes sont autorisées.',
          );
        },
      },
      'Prévalider dans un nouvel onglet',
    );

    const head = div({ class: ui.recipeHead }, [
      button(
        'backToRecipeCatalog',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          click: function* () {
            yield* CraftRouter.navigate({ to: 'recipes' });
          },
        },
        '← Recettes',
      ),
      div({ class: ui.rowTitle }, [
        heading({ class: ui.title }, function* () {
          const item = recipeValue();
          return item ? recipeName(item) : 'Recette';
        }),
        span(
          {
            class: badgeUi.root,
            'data-lab': 'recipe-validation-status',
            'data-tone': function* () {
              const item = recipeValue();
              return item
                ? recipeValidationTone(item.validation.status)
                : 'info';
            },
            hidden: function* () {
              return recipeValue() === undefined;
            },
          },
          function* () {
            const item = recipeValue();
            return item ? RECIPE_VALIDATION_LABEL[item.validation.status] : '';
          },
        ),
      ]),
      p(
        {
          class: ui.lede,
          hidden: function* () {
            const item = recipeValue();
            return (
              !item?.summary?.trim() || item.summary.trim() === recipeName(item)
            );
          },
        },
        function* () {
          return recipeValue()?.summary?.trim() ?? '';
        },
      ),
    ]);

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

    const issuesText = yield* craftComputed('issuesText', () =>
      validationIssues(recipeValue()),
    );
    const failure = div(
      {
        class: ui.gap,
        hidden: function* () {
          return validationIssues(recipeValue()) === '';
        },
      },
      [
        DocCallout({
          tone: function* () {
            return recipeValue()?.validation.status === 'verified'
              ? 'info'
              : 'danger';
          },
          caption: lit('Ce qui a bloqué'),
          body: content(() => [p(issuesText)]),
        }),
      ],
    );

    const actions = div({ class: ui.gapActions }, [
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
    ]);

    const objective = div({ class: ui.recipeCard }, [
      heading({ class: ui.sideSectionTitle }, 'Objectif'),
      p({ class: ui.factValue }, function* () {
        return recipeValue()?.objective.goal ?? '';
      }),
      div(
        {
          class: ui.sideSection,
          hidden: function* () {
            return (recipeValue()?.objective.exact.length ?? 0) === 0;
          },
        },
        [
          p({ class: ui.factLabel }, 'Doit être exact'),
          ul(
            { class: ui.howToSteps },
            forNode(
              yield* craftComputed(
                'exact',
                () => recipeValue()?.objective.exact ?? [],
              ),
              { track: (line) => line },
              (line) => li(line),
            ),
          ),
        ],
      ),
      div(
        {
          class: ui.sideSection,
          hidden: function* () {
            return (recipeValue()?.objective.approximate.length ?? 0) === 0;
          },
        },
        [
          p({ class: ui.factLabel }, 'Peut varier'),
          ul(
            { class: ui.howToSteps },
            forNode(
              yield* craftComputed(
                'approximate',
                () => recipeValue()?.objective.approximate ?? [],
              ),
              { track: (line) => line },
              (line) => li(line),
            ),
          ),
        ],
      ),
      p({ class: ui.eventMeta }, function* () {
        return recipeBoundaries(recipeValue());
      }),
    ]);

    const origin = div({ class: ui.recipeCard }, [
      heading({ class: ui.sideSectionTitle }, 'Origine'),
      p({ class: ui.factValue }, function* () {
        return recipeOrigin(recipeValue(), sourceValue());
      }),
      div({ class: ui.gapActions }, [
        button(
          'openSourceSession',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'recipe-source-session',
            hidden: function* () {
              return sourceValue() === undefined;
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
          'Ouvrir la session d’origine',
        ),
      ]),
    ]);

    const stepList = div({ class: ui.recipeCard }, [
      heading({ class: ui.sideSectionTitle }, function* () {
        const stepsItem = yield* steps();
        return plural(stepsItem.length, 'étape');
      }),
      ol(
        { class: ui.recipeSteps, 'data-lab': 'recipe-steps' },
        forNode(steps, { track: (step) => step.index }, (step) =>
          li(function* () {
            const stepItem = yield* step();
            return stepItem.text;
          }),
        ),
      ),
    ]);

    const runList = div(
      {
        class: ui.recipeCard,
        hidden: function* () {
          const runsItem = yield* runs();
          return runsItem.length === 0;
        },
      },
      [
        heading({ class: ui.sideSectionTitle }, function* () {
          const runsItem = yield* runs();
          return plural(runsItem.length, 'exécution');
        }),
        ul(
          { class: ui.events, 'data-lab': 'recipe-runs' },
          forNode(runs, { track: (run) => run.id }, (run) =>
            li(
              {
                class: ui.event,
                'data-entry': function* () {
                  const runItem = yield* run();
                  return runItem.status === 'failed' ? 'error' : undefined;
                },
              },
              span({ class: ui.eventName }, function* () {
                const runItem = yield* run();
                return runText(runItem);
              }),
            ),
          ),
        ),
      ],
    );

    const recorded = div(
      {
        class: ui.recipeCard,
        hidden: function* () {
          return recordedValue().length === 0;
        },
      },
      [
        heading({ class: ui.sideSectionTitle }, function* () {
          return plural(
            recordedValue().length,
            'session enregistrée par cette recette',
            'sessions enregistrées par cette recette',
          );
        }),
        ul(
          { class: ui.events },
          forNode(recordedSessions, { track: (item) => item.id }, (item) =>
            li(
              { class: ui.linkItem },
              button(
                'openRecipeSession',
                {
                  type: 'button',
                  class: ui.listLink,
                  'data-lab': 'recipe-session',
                  click: function* () {
                    const itemItem = yield* item();
                    yield* CraftRouter.navigate({
                      to: 'sessions/:sessionId',
                      params: { sessionId: itemItem.id },
                    });
                  },
                },
                [
                  span({ class: ui.listLinkTitle }, function* () {
                    const itemItem = yield* item();
                    return sessionDate.format(new Date(itemItem.createdAt));
                  }),
                  span({ class: ui.eventMeta }, function* () {
                    const saved = yield* item();
                    return [
                      plural(saved.eventCount, 'événement'),
                      ...(saved.status === 'interrupted'
                        ? ['interrompue']
                        : []),
                    ].join(' · ');
                  }),
                ],
              ),
            ),
          ),
        ),
      ],
    );

    const detail = div(
      {
        class: ui.recipeDetail,
        hidden: function* () {
          return recipeValue() === undefined;
        },
      },
      [
        failure,
        div(
          {
            role: 'status',
            class: ui.eventMeta,
            hidden: function* () {
              return !feedbackText();
            },
          },
          feedbackText,
        ),
        actions,
        div({ class: ui.recipeGrid }, [objective, origin]),
        stepList,
        runList,
        recorded,
      ],
    );

    return div({ class: ui.scroll }, [
      div({ class: ui.listPage }, [head, noRecipe, detail]),
    ]);
  },
);
