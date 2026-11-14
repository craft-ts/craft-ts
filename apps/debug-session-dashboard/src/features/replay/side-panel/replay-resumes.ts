import {
  button,
  craftComponent,
  details,
  div,
  forNode,
  heading,
  li,
  ol,
  p,
  pre,
  span,
  summary,
  ul,
} from '@craft-ts/component';
import { CraftRouter, craftUse } from '@craft-ts/core';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import { type ResumeMessage } from '../../../shared/data-access/resume-thread.service';
import {
  SessionArchive,
  type ResumeCheckpointSummary,
  type ResumeRecipeSummary,
} from '../../../shared/data-access/session-archive.service';
import { ReplaySession } from '../../../shared/state/replay-session';
import { ui } from '../../../shared/ui/dashboard.style';
import { i18n } from '../../../shared/util/catalog';
import { openLinkedTab } from '../../../shared/util/replay-browser';
import { sessionDate } from '../../../shared/util/replay-labels';
import { plural } from '../../../shared/util/replay-model';
import {
  RECIPE_RUN_STATUS,
  RECIPE_VALIDATION_LABEL,
  recipeName,
  recipeValidationTone,
} from '../../../shared/util/session-lineage';
import { copyResumePrompt } from '../resume-prompt';
import { ReplayResumesViewModel } from './replay-resumes-view-model.service';

const KIND_LABELS: Readonly<Record<ResumeMessage['kind'], string>> = {
  step: 'Étape',
  question: 'Question',
  handoff: 'À vous',
  done: 'Terminé',
  reply: 'Réponse',
};

const timeLabel = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const dayLabel = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function messageMeta(message: ResumeMessage): string {
  const who = message.from === 'ai' ? 'IA' : 'Vous';
  return `${who} · ${KIND_LABELS[message.kind]} · ${timeLabel.format(new Date(message.at))}`;
}

function momentLabel(beforeSequence: number | undefined): string {
  return beforeSequence === undefined
    ? i18n.t('momentEndOfRecording')
    : i18n.t('momentBeforeEvent', { count: beforeSequence });
}

function checkpointMeta(checkpoint: ResumeCheckpointSummary): string {
  return [
    momentLabel(checkpoint.beforeSequence),
    ...(checkpoint.route ? [checkpoint.route.split('?')[0] ?? ''] : []),
    checkpoint.expired
      ? i18n.t('checkpointExpired')
      : i18n.t('checkpointValidUntil', {
          date: dayLabel.format(new Date(checkpoint.expiresAt)),
        }),
  ].join(' · ');
}

function recipeRunSummary(recipe: ResumeRecipeSummary): string {
  const latest = recipe.runs[0];
  return [
    momentLabel(recipe.beforeSequence),
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

/**
 * Everything the guided resume left on this recording, in the order a person
 * meets it: the request in flight and what the agent says about it, then the
 * points it froze, the recipes it wrote, and the sessions those runs recorded.
 */
export const ReplayResumes = craftComponent('ReplayResumes', {}, function* () {
  const replaySession = yield* ReplaySession();
  const archive = yield* SessionArchive();
  const { checkpoints, recipes, derived, messages, noticeHere, nothingYet } =
    yield* ReplayResumesViewModel();
  const noticeValue = noticeHere;

  // How it works, once: open while nothing exists yet, folded after.
  const howItWorks = details(
    {
      class: ui.howTo,
      open: nothingYet,
    },
    [
      summary('Comment fonctionne une reprise ?'),
      ol({ class: ui.howToSteps }, [
        li(
          'Placez le replay au moment voulu, puis « Reprendre ici » et dites ce que vous cherchez.',
        ),
        li(
          'Un agent IA rouvre l’application à ce moment, avec de vraies données. Il vous demande la main seulement pour un secret (connexion…).',
        ),
        li(
          'Il laisse un point de reprise, réutilisable quelques jours, et souvent une recette pour y revenir plus tard.',
        ),
      ]),
    ],
  );

  // The request just sent from here: the sentence for the agent, kept in
  // view in case the copy did not reach the clipboard.
  const request = div(
    {
      class: ui.sideCard,
      'data-lab': 'resume-requested',
      hidden: function* () {
        const _noticeValue = yield* noticeValue();
        return _noticeValue === undefined;
      },
    },
    [
      heading({ class: ui.sideSectionTitle }, i18n.t('copy.copy100')),
      p({ class: ui.lede }, function* () {
        const _noticeValue = yield* noticeValue();
        return _noticeValue?.appTabOpened
          ? i18n.t('copy.copy101')
          : i18n.t('copy.copy102');
      }),
      details([
        summary('Voir le prompt copié'),
        pre({ class: ui.code, 'data-lab': 'resume-prompt' }, function* () {
          const _noticeValue = yield* noticeValue();
          return _noticeValue?.prompt ?? '';
        }),
      ]),
      div({ class: ui.gapActions }, [
        button(
          'copyResumePromptAgain',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'primary',
            click: function* () {
              const _noticeValue = yield* noticeValue();
              yield* copyResumePrompt(_noticeValue?.prompt ?? '');
            },
          },
          i18n.t('copy.copy103'),
        ),
        button(
          'openResumeAppTab',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            hidden: function* () {
              const _noticeValue = yield* noticeValue();
              return !_noticeValue?.appUrl;
            },
            click: () => {
              const href = craftUse(noticeValue())?.appUrl;
              if (href) openLinkedTab(href);
            },
          },
          i18n.t('copy.copy104'),
        ),
        button(
          'dismissResumeNotice',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'link',
            click: () => archive.resumeNotice.dismiss(),
          },
          i18n.t('copy.copy105'),
        ),
      ]),
    ],
  );

  const thread = div(
    {
      class: ui.sideSection,
      hidden: function* () {
        const _messagesValue = yield* messages();
        return _messagesValue.length === 0;
      },
    },
    [
      heading({ class: ui.sideSectionTitle }, i18n.t('copy.copy106')),
      ul(
        { class: ui.events, 'data-lab': 'resume-thread' },
        forNode(messages, { track: (message) => message.id }, (message) =>
          li(
            {
              class: ui.event,
              'data-from': function* () {
                const messageItem = yield* message();
                return messageItem.from;
              },
            },
            [
              div({ class: ui.eventInfo }, [
                span({ class: ui.eventName }, function* () {
                  const messageItem = yield* message();
                  return messageItem.text;
                }),
                span({ class: ui.eventMeta }, function* () {
                  const messageItem = yield* message();
                  return messageMeta(messageItem);
                }),
              ]),
            ],
          ),
        ),
      ),
    ],
  );

  const points = div(
    {
      class: ui.sideSection,
      hidden: function* () {
        const _checkpointsValue = yield* checkpoints();
        return _checkpointsValue.length === 0;
      },
    },
    [
      heading({ class: ui.sideSectionTitle }, function* () {
        const _checkpointsValue = yield* checkpoints();
        return plural(
          _checkpointsValue.length,
          'point de reprise',
          'points de reprise',
        );
      }),
      ul(
        { class: ui.events, 'data-lab': 'resume-checkpoints' },
        forNode(
          checkpoints,
          { track: (checkpoint) => checkpoint.id },
          (checkpoint) =>
            li({ class: ui.event }, [
              div({ class: ui.eventInfo }, [
                span({ class: ui.eventName }, function* () {
                  const item = yield* checkpoint();
                  return item.label ?? item.goal ?? i18n.t('copy.copy107');
                }),
                span({ class: ui.eventMeta }, function* () {
                  const checkpointItem = yield* checkpoint();
                  return checkpointMeta(checkpointItem);
                }),
              ]),
              button(
                'seekToCheckpoint',
                {
                  type: 'button',
                  class: [buttonUi.root, ui.inlineAction],
                  'data-variant': 'link',
                  'data-lab': 'seek-to-checkpoint',
                  'data-tooltip':
                    'Place le replay juste avant l’événement de ce point.',
                  click: function* () {
                    const checkpointItem = yield* checkpoint();
                    replaySession.seekReplayBeforeSequence(
                      checkpointItem.beforeSequence,
                    );
                  },
                },
                i18n.t('copy.copy108'),
              ),
            ]),
        ),
      ),
    ],
  );

  const recipeList = div(
    {
      class: ui.sideSection,
      hidden: function* () {
        const _recipesValue = yield* recipes();
        return _recipesValue.length === 0;
      },
    },
    [
      heading({ class: ui.sideSectionTitle }, function* () {
        const _recipesValue = yield* recipes();
        return plural(_recipesValue.length, 'recette');
      }),
      ul(
        { class: ui.events, 'data-lab': 'resume-recipes' },
        forNode(recipes, { track: (recipe) => recipe.id }, (recipe) =>
          li(
            { class: ui.linkItem },
            button(
              'openSessionRecipe',
              {
                type: 'button',
                class: ui.listLink,
                'data-lab': 'session-recipe',
                click: function* () {
                  const recipeItem = yield* recipe();
                  yield* CraftRouter.navigate({
                    to: 'recipes/:recipeId',
                    params: { recipeId: recipeItem.id },
                  });
                },
              },
              [
                span({ class: ui.listLinkTitle }, [
                  span(function* () {
                    const recipeItem = yield* recipe();
                    return recipeName(recipeItem);
                  }),
                  span(
                    {
                      class: badgeUi.root,
                      'data-tone': function* () {
                        const recipeItem = yield* recipe();
                        return recipeValidationTone(
                          recipeItem.validation.status,
                        );
                      },
                    },
                    function* () {
                      const recipeItem = yield* recipe();
                      return RECIPE_VALIDATION_LABEL[
                        recipeItem.validation.status
                      ];
                    },
                  ),
                ]),
                span({ class: ui.eventMeta }, function* () {
                  const recipeItem = yield* recipe();
                  return recipeRunSummary(recipeItem);
                }),
              ],
            ),
          ),
        ),
      ),
    ],
  );

  const derivedList = div(
    {
      class: ui.sideSection,
      hidden: function* () {
        const _derivedValue = yield* derived();
        return _derivedValue.length === 0;
      },
    },
    [
      heading({ class: ui.sideSectionTitle }, function* () {
        const _derivedValue = yield* derived();
        return plural(
          _derivedValue.length,
          'session issue de celle-ci',
          'sessions issues de celle-ci',
        );
      }),
      ul(
        { class: ui.events, 'data-lab': 'derived-sessions' },
        forNode(derived, { track: (item) => item.session.id }, (item) =>
          li(
            { class: ui.linkItem },
            button(
              'openDerivedSession',
              {
                type: 'button',
                class: ui.listLink,
                'data-lab': 'derived-session',
                click: function* () {
                  const itemItem = yield* item();
                  yield* CraftRouter.navigate({
                    to: 'sessions/:sessionId',
                    params: { sessionId: itemItem.session.id },
                  });
                },
              },
              [
                span({ class: ui.listLinkTitle }, function* () {
                  const { session: saved } = yield* item();
                  return sessionDate.format(new Date(saved.createdAt));
                }),
                span({ class: ui.eventMeta }, function* () {
                  const { session: saved, resumeDescription } = yield* item();
                  return [
                    saved.resume?.kind === 'guided-resume'
                      ? i18n.t('resumeGuided')
                      : i18n.t('resumeRecipe', {
                          name: resumeDescription ?? '?',
                        }),
                    ...(saved.resume?.beforeSequence === undefined
                      ? []
                      : [momentLabel(saved.resume.beforeSequence)]),
                    plural(saved.eventCount, 'événement'),
                    ...(saved.status === 'interrupted'
                      ? [i18n.t('resumeInterrupted')]
                      : saved.status === 'recording'
                        ? [i18n.t('resumeRecording')]
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

  return div({ class: ui.sideBody }, [
    div({ class: ui.scroll }, [
      div({ class: ui.sideStack }, [
        request,
        thread,
        points,
        recipeList,
        derivedList,
        howItWorks,
      ]),
    ]),
  ]);
});
