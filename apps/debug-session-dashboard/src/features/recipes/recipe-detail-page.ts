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
  craftComputed,
  CraftRouter,
  state,
} from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import {
  httpFailureReason,
  SessionArchive,
  type ResumeRecipeDetail,
  type ResumeRecipeRunSummary,
  type SessionSummary,
} from '../../shared/data-access/session-archive.service';
import { ReplayDebug } from '../../shared/state/replay-debug';
import { ui } from '../../shared/ui/dashboard.style';
import { i18n } from '../../shared/util/catalog';
import { sessionDate } from '../../shared/util/replay-labels';
import { isRecord, plural } from '../../shared/util/replay-model';
import {
  RECIPE_RUN_STATUS,
  RECIPE_VALIDATION_LABEL,
  recipeName,
  recipeValidationTone,
} from '../../shared/util/session-lineage';
import { lit } from '../../shared/util/view-helpers';

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
    return i18n.t('conditionVisibleText', { detail: condition['visibleText'] });
  if (typeof condition['route'] === 'string')
    return i18n.t('conditionRoute', { detail: condition['route'] });
  return JSON.stringify(condition);
}

/** One step of a recipe, in a sentence. Unknown kinds keep their raw shape. */
function stepText(step: Readonly<Record<string, unknown>>): string {
  const type = step['type'];
  if (type === 'network')
    return step['mode'] === 'mocked'
      ? i18n.t('recipeStepMockedNetwork')
      : i18n.t('recipeStepRealNetwork');
  if (type === 'goto' && typeof step['route'] === 'string')
    return i18n.t('recipeStepGoto', { detail: step['route'] });
  if (type === 'handoff')
    return i18n.t('recipeStepHandoff', {
      detail:
        typeof step['message'] === 'string'
          ? step['message']
          : i18n.t('recipeStepHandoffDefault'),
    });
  if (type === 'expect')
    return i18n.t(
      step['level'] === 'essential'
        ? 'recipeStepExpectEssential'
        : 'recipeStepExpect',
      { detail: conditionText(step['condition']) },
    );
  if (type === 'checkpoint') return i18n.t('recipeStepCheckpoint');
  const { type: _type, ...rest } = step;
  return `${String(type)} ${JSON.stringify(rest)}`;
}

function runText(run: ResumeRecipeRunSummary): string {
  return [
    dateTime.format(new Date(run.startedAt)),
    RECIPE_RUN_STATUS[run.status] ?? run.status,
    ...(run.currentStep === undefined
      ? []
      : [i18n.t('recipeRunStep', { count: run.currentStep + 1 })]),
    ...(run.failure ? [run.failure.detail] : []),
  ].join(' · ');
}

function validationIssues(item: ResumeRecipeDetail | undefined): string {
  if (!item) return '';
  const issues = [...item.validation.issues];
  const failure = item.runs[0]?.failure;
  if (failure) {
    // The archive often repeats the failure as an issue: name its step instead.
    const step = i18n.t('recipeFailureStep', {
      count: (failure.step ?? 0) + 1,
      detail: failure.detail,
    });
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
      ? i18n.t('recipeMayWrite')
      : i18n.t('recipeNeverWrites'),
    item.strategy === 'autonomous'
      ? i18n.t('recipeAutonomous')
      : i18n.t('recipeExistingData'),
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
      ? i18n.t('recipeMomentEnd')
      : i18n.t('recipeMomentBefore', { count: item.beforeSequence });
  return source
    ? i18n.t('copy.copy027') +
        sessionDate.format(new Date(source.createdAt)) +
        i18n.t('copy.copy028') +
        moment +
        '.'
    : i18n.t('copy.copy029') + moment + '.';
}

/** One recipe: what it is for, what it does, how its runs went, and where it comes from. */
export const RecipeDetailPage = craftComponent(
  'RecipeDetailPage',
  {},
  function* () {
    const route = yield* CraftActivatedRoute();
    const archive = yield* SessionArchive();
    const replayDebug = yield* ReplayDebug();
    const recipeId = route.snapshot.params['recipeId'];
    archive.recipeDetail.call(recipeId);

    const detailValue = archive.recipeDetail.resumeRecipeDetail;
    const detailFailure = archive.recipeDetail.exception;
    const savedSessions = archive.sessions.savedSessions;
    const recipe = yield* craftComputed('recipe', function* () {
      const _detailValue = yield* detailValue();
      const _detailValue2 = yield* detailValue();
      return _detailValue2?.id === recipeId ? _detailValue : undefined;
    });
    const recipeValue = recipe;
    const feedback = yield* state(
      'feedback',
      '',
      function* ({ state: read, set }) {
        const setFeedback = (value: string) => set(value);
        return { setFeedback, message: read };
      },
    );
    const feedbackText = feedback.message;
    const loadMessage = yield* craftComputed('loadMessage', function* () {
      const _detailFailure = yield* detailFailure();
      const _detailFailure2 = yield* detailFailure();
      return !recipeId
        ? i18n.t('copy.copy030')
        : _detailFailure2
          ? i18n.t('copy.copy031') + httpFailureReason(_detailFailure) + ''
          : i18n.t('copy.copy032');
    });
    const steps = yield* craftComputed('steps', function* () {
      const _recipeValue = yield* recipeValue();
      return (
        _recipeValue?.steps.map((step, index) => ({
          index,
          text: stepText(step),
        })) ?? []
      );
    });
    const runs = yield* craftComputed('runs', function* () {
      const _recipeValue = yield* recipeValue();
      return _recipeValue?.runs ?? [];
    });
    const recordedSessions = yield* craftComputed(
      'recordedSessions',
      function* () {
        const _savedSessions = yield* savedSessions();
        return _savedSessions.filter(
          (session) =>
            session.resume?.kind === 'recipe-run' &&
            session.resume.recipeId === recipeId,
        );
      },
    );
    const recordedValue = recordedSessions;
    const source = yield* craftComputed('source', function* () {
      const _savedSessions = yield* savedSessions();
      const _recipeValue = yield* recipeValue();
      return _savedSessions.find(
        (session) => session.id === _recipeValue?.sessionId,
      );
    });
    const sourceValue = source;

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
          const _recipeValue = yield* recipeValue();
          return _recipeValue === undefined;
        },
        click: function* () {
          const _recipeValue = yield* recipeValue();
          const item = _recipeValue;
          if (!item) return;
          const opened = replayDebug.launchResumeRecipeTab(
            item.id,
            item.origin,
          );
          yield* feedback.setFeedback(
            opened
              ? 'La recette tourne dans un nouvel onglet. Actualisez le statut quand elle a fini.'
              : 'Impossible d’ouvrir la recette. Vérifiez que son origine est locale et que les fenêtres surgissantes sont autorisées.',
          );
        },
      },
      i18n.t('copy.copy033'),
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
        i18n.t('copy.copy034'),
      ),
      div({ class: ui.rowTitle }, [
        heading({ class: ui.title }, function* () {
          const _recipeValue = yield* recipeValue();
          const item = _recipeValue;
          return item ? recipeName(item) : i18n.t('copy.copy035');
        }),
        span(
          {
            class: badgeUi.root,
            'data-lab': 'recipe-validation-status',
            'data-tone': function* () {
              const _recipeValue = yield* recipeValue();
              const item = _recipeValue;
              return item
                ? recipeValidationTone(item.validation.status)
                : 'info';
            },
            hidden: function* () {
              const _recipeValue = yield* recipeValue();
              return _recipeValue === undefined;
            },
          },
          function* () {
            const _recipeValue = yield* recipeValue();
            const item = _recipeValue;
            return item ? RECIPE_VALIDATION_LABEL[item.validation.status] : '';
          },
        ),
      ]),
      p(
        {
          class: ui.lede,
          hidden: function* () {
            const _recipeValue = yield* recipeValue();
            const item = _recipeValue;
            return (
              !item?.summary?.trim() || item.summary.trim() === recipeName(item)
            );
          },
        },
        function* () {
          const _recipeValue = yield* recipeValue();
          return _recipeValue?.summary?.trim() ?? '';
        },
      ),
    ]);

    const noRecipe = p(
      {
        class: ui.empty,
        role: 'status',
        hidden: function* () {
          const _recipeValue = yield* recipeValue();
          return _recipeValue !== undefined;
        },
      },
      loadMessage,
    );

    const issuesText = yield* craftComputed('issuesText', function* () {
      const _recipeValue = yield* recipeValue();
      return validationIssues(_recipeValue);
    });
    const failure = div(
      {
        class: ui.gap,
        hidden: function* () {
          const _recipeValue = yield* recipeValue();
          return validationIssues(_recipeValue) === '';
        },
      },
      [
        DocCallout({
          tone: function* () {
            const _recipeValue = yield* recipeValue();
            return _recipeValue?.validation.status === 'verified'
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
            const _recipeValue = yield* recipeValue();
            return _recipeValue === undefined;
          },
          click: function* () {
            const _recipeValue = yield* recipeValue();
            const item = _recipeValue;
            if (item) archive.recipeDetail.call(item.id);
          },
        },
        i18n.t('copy.copy036'),
      ),
    ]);

    const objective = div({ class: ui.recipeCard }, [
      heading({ class: ui.sideSectionTitle }, i18n.t('copy.copy037')),
      p({ class: ui.factValue }, function* () {
        const _recipeValue = yield* recipeValue();
        return _recipeValue?.objective.goal ?? '';
      }),
      div(
        {
          class: ui.sideSection,
          hidden: function* () {
            const _recipeValue = yield* recipeValue();
            return (_recipeValue?.objective.exact.length ?? 0) === 0;
          },
        },
        [
          p({ class: ui.factLabel }, i18n.t('copy.copy038')),
          ul(
            { class: ui.howToSteps },
            forNode(
              yield* craftComputed('exact', function* () {
                const _recipeValue = yield* recipeValue();
                return _recipeValue?.objective.exact ?? [];
              }),
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
            const _recipeValue = yield* recipeValue();
            return (_recipeValue?.objective.approximate.length ?? 0) === 0;
          },
        },
        [
          p({ class: ui.factLabel }, i18n.t('copy.copy039')),
          ul(
            { class: ui.howToSteps },
            forNode(
              yield* craftComputed('approximate', function* () {
                const _recipeValue = yield* recipeValue();
                return _recipeValue?.objective.approximate ?? [];
              }),
              { track: (line) => line },
              (line) => li(line),
            ),
          ),
        ],
      ),
      p({ class: ui.eventMeta }, function* () {
        const _recipeValue = yield* recipeValue();
        return recipeBoundaries(_recipeValue);
      }),
    ]);

    const origin = div({ class: ui.recipeCard }, [
      heading({ class: ui.sideSectionTitle }, i18n.t('copy.copy040')),
      p({ class: ui.factValue }, function* () {
        const _sourceValue = yield* sourceValue();
        const _recipeValue = yield* recipeValue();
        return recipeOrigin(_recipeValue, _sourceValue);
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
              const _sourceValue = yield* sourceValue();
              return _sourceValue === undefined;
            },
            click: function* () {
              const _recipeValue = yield* recipeValue();
              const item = _recipeValue;
              if (item) {
                yield* CraftRouter.navigate({
                  to: 'sessions/:sessionId',
                  params: { sessionId: item.sessionId },
                });
              }
            },
          },
          i18n.t('copy.copy041'),
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
          const _recordedValue = yield* recordedValue();
          return _recordedValue.length === 0;
        },
      },
      [
        heading({ class: ui.sideSectionTitle }, function* () {
          const _recordedValue = yield* recordedValue();
          return plural(
            _recordedValue.length,
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
                        ? [i18n.t('resumeInterrupted')]
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
          const _recipeValue = yield* recipeValue();
          return _recipeValue === undefined;
        },
      },
      [
        failure,
        div(
          {
            role: 'status',
            class: ui.eventMeta,
            hidden: function* () {
              const _feedbackText = yield* feedbackText();
              return !_feedbackText;
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
