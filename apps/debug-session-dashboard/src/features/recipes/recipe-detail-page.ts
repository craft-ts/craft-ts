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
import { ReplayState } from '../../shared/state/replay-state';
import { ui } from '../../shared/ui/dashboard.style';
import { i18n } from '../../shared/util/catalog';
import { sessionDate } from '../../shared/util/replay-labels';
import { plural } from '../../shared/util/replay-model';
import {
  RECIPE_VALIDATION_LABEL,
  recipeName,
  recipeValidationTone,
} from '../../shared/util/session-lineage';
import { lit } from '../../shared/util/view-helpers';
import {
  recipeRunText,
  recipeStepText,
  recipeValidationIssues,
} from './recipe-detail-view-model';

let requestedRecipeId: string | undefined;

function* recipeDetail(): Generator<unknown, ResumeRecipeDetail | undefined, unknown> {
  const route = yield* CraftActivatedRoute();
  const archive = yield* SessionArchive();
  const id = route.snapshot.params['recipeId'];
  if (requestedRecipeId !== id) {
    requestedRecipeId = id;
    archive.recipeDetail.call(id);
  }
  const detail = yield* archive.recipeDetail.resumeRecipeDetail();
  return detail?.id === id ? detail : undefined;
}

function* recipeLoadMessage(): Generator<unknown, string, unknown> {
  const route = yield* CraftActivatedRoute();
  const failure = yield* (yield* SessionArchive()).recipeDetail.exception();
  return !route.snapshot.params['recipeId']
    ? i18n.t('copy.copy030')
    : failure
      ? i18n.t('copy.copy031') + httpFailureReason(failure)
      : i18n.t('copy.copy032');
}

function* recipeRecordedSessions(): Generator<unknown, SessionSummary[], unknown> {
  const route = yield* CraftActivatedRoute();
  const sessions = yield* (yield* SessionArchive()).sessions.savedSessions();
  const recipeId = route.snapshot.params['recipeId'];
  return sessions.filter(
    (session) =>
      session.resume?.kind === 'recipe-run' &&
      session.resume.recipeId === recipeId,
  );
}

function* recipeSource(): Generator<unknown, SessionSummary | undefined, unknown> {
  const recipe = yield* recipeDetail();
  const sessions = yield* (yield* SessionArchive()).sessions.savedSessions();
  return sessions.find((session) => session.id === recipe?.sessionId);
}

function* recipeSteps(): Generator<unknown, { index: number; text: string }[], unknown> {
  const recipe = yield* recipeDetail();
  return recipe?.steps.map((step, index) => ({
    index,
    // eslint-disable-next-line craft-ts/require-i18n-text -- recipeStepText translates every step kind internally
    text: recipeStepText(step),
  })) ?? [];
}

function* recipeRuns(): Generator<unknown, readonly ResumeRecipeRunSummary[], unknown> {
  return (yield* recipeDetail())?.runs ?? [];
}

function* recipeIssues(): Generator<unknown, string, unknown> {
  return recipeValidationIssues(yield* recipeDetail());
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
          const _recipeValue = yield* recipeDetail();
          return _recipeValue === undefined;
        },
        click: function* () {
          const _recipeValue = yield* recipeDetail();
          const item = _recipeValue;
          if (!item) return;
          const replayDebug = yield* ReplayDebug();
          replayDebug.launchResumeRecipeTab(item.id, item.origin);
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
          const _recipeValue = yield* recipeDetail();
          const item = _recipeValue;
          return item ? recipeName(item) : i18n.t('copy.copy035');
        }),
        span(
          {
            class: badgeUi.root,
            'data-lab': 'recipe-validation-status',
            'data-tone': function* () {
              const _recipeValue = yield* recipeDetail();
              const item = _recipeValue;
              return item
                ? recipeValidationTone(item.validation.status)
                : 'info';
            },
            hidden: function* () {
              const _recipeValue = yield* recipeDetail();
              return _recipeValue === undefined;
            },
          },
          function* () {
            const _recipeValue = yield* recipeDetail();
            const item = _recipeValue;
            return item ? RECIPE_VALIDATION_LABEL[item.validation.status] : '';
          },
        ),
      ]),
      p(
        {
          class: ui.lede,
          hidden: function* () {
            const _recipeValue = yield* recipeDetail();
            const item = _recipeValue;
            return (
              !item?.summary?.trim() || item.summary.trim() === recipeName(item)
            );
          },
        },
        function* () {
          const _recipeValue = yield* recipeDetail();
          return _recipeValue?.summary?.trim() ?? '';
        },
      ),
    ]);

    const noRecipe = p(
      {
        class: ui.empty,
        role: 'status',
        hidden: function* () {
          const _recipeValue = yield* recipeDetail();
          return _recipeValue !== undefined;
        },
      },
      recipeLoadMessage,
    );

    const failure = div(
      {
        class: ui.gap,
        hidden: function* () {
          return (yield* recipeIssues()) === '';
        },
      },
      [
        DocCallout({
          tone: function* () {
            const _recipeValue = yield* recipeDetail();
            return _recipeValue?.validation.status === 'verified'
              ? 'info'
              : 'danger';
          },
          caption: lit('Ce qui a bloqué'),
          body: content(() => [p(recipeIssues)]),
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
            const _recipeValue = yield* recipeDetail();
            return _recipeValue === undefined;
          },
          click: function* () {
            const _recipeValue = yield* recipeDetail();
            const item = _recipeValue;
            if (item) (yield* SessionArchive()).recipeDetail.call(item.id);
          },
        },
        i18n.t('copy.copy036'),
      ),
    ]);

    const objective = div({ class: ui.recipeCard }, [
      heading({ class: ui.sideSectionTitle }, i18n.t('copy.copy037')),
      p({ class: ui.factValue }, function* () {
        const _recipeValue = yield* recipeDetail();
        return _recipeValue?.objective.goal ?? '';
      }),
      div(
        {
          class: ui.sideSection,
          hidden: function* () {
            const _recipeValue = yield* recipeDetail();
            return (_recipeValue?.objective.exact.length ?? 0) === 0;
          },
        },
        [
          p({ class: ui.factLabel }, i18n.t('copy.copy038')),
          ul(
            { class: ui.howToSteps },
            forNode(
              function* () {
                return (yield* recipeDetail())?.objective.exact ?? [];
              },
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
            const _recipeValue = yield* recipeDetail();
            return (_recipeValue?.objective.approximate.length ?? 0) === 0;
          },
        },
        [
          p({ class: ui.factLabel }, i18n.t('copy.copy039')),
          ul(
            { class: ui.howToSteps },
            forNode(
              function* () {
                return (yield* recipeDetail())?.objective.approximate ?? [];
              },
              { track: (line) => line },
              (line) => li(line),
            ),
          ),
        ],
      ),
      p({ class: ui.eventMeta }, function* () {
        const _recipeValue = yield* recipeDetail();
        return recipeBoundaries(_recipeValue);
      }),
    ]);

    const origin = div({ class: ui.recipeCard }, [
      heading({ class: ui.sideSectionTitle }, i18n.t('copy.copy040')),
      p({ class: ui.factValue }, function* () {
        const _sourceValue = yield* recipeSource();
        const _recipeValue = yield* recipeDetail();
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
              const _sourceValue = yield* recipeSource();
              return _sourceValue === undefined;
            },
            click: function* () {
              const _recipeValue = yield* recipeDetail();
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
        const stepsItem = yield* recipeSteps();
        return plural(stepsItem.length, 'étape');
      }),
      ol(
        { class: ui.recipeSteps, 'data-lab': 'recipe-steps' },
        forNode(recipeSteps, { track: (step) => step.index }, (step) =>
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
          const runsItem = yield* recipeRuns();
          return runsItem.length === 0;
        },
      },
      [
        heading({ class: ui.sideSectionTitle }, function* () {
          const runsItem = yield* recipeRuns();
          return plural(runsItem.length, 'exécution');
        }),
        ul(
          { class: ui.events, 'data-lab': 'recipe-runs' },
          forNode(
            recipeRuns,
            { track: (run) => run.id },
            (run) =>
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
                // eslint-disable-next-line craft-ts/require-i18n-text -- recipeRunText translates each status and detail internally
                return recipeRunText(runItem);
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
          const _recordedValue = yield* recipeRecordedSessions();
          return _recordedValue.length === 0;
        },
      },
      [
        heading({ class: ui.sideSectionTitle }, function* () {
          const _recordedValue = yield* recipeRecordedSessions();
          return plural(
            _recordedValue.length,
            'session enregistrée par cette recette',
            'sessions enregistrées par cette recette',
          );
        }),
        ul(
          { class: ui.events },
          forNode(recipeRecordedSessions, { track: (item) => item.id }, (item) =>
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
          const _recipeValue = yield* recipeDetail();
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
              return !(yield* (yield* ReplayState()).imperative.status());
            },
          },
          function* () {
            return yield* (yield* ReplayState()).imperative.status();
          },
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
