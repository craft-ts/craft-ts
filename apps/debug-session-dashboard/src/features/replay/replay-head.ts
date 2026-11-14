import {
  button,
  craftComponent,
  div,
  forNode,
  option,
  p,
  renderContent,
  select,
  span,
  type ContentSlot,
} from '@craft-ts/component';
import { craftComputed, CraftRouter } from '@craft-ts/core';
import { DocIcon } from '@craft-ts/ui';
import { buttonUi, iconButtonUi } from '@craft-ts/ui/style';
import {
  SessionArchive,
  type SessionSummary,
} from '../../shared/data-access/session-archive.service';
import { ReplayDebug } from '../../shared/state/replay-debug';
import { ReplaySession } from '../../shared/state/replay-session';
import {
  activeRouteSessionId,
  connected,
  replayableParticipants,
  replayParticipantIds,
  ReplayState,
  routeSessionId,
  selectedParticipantId,
  session,
} from '../../shared/state/replay-state';
import { ui } from '../../shared/ui/dashboard.style';
import { i18n } from '../../shared/util/catalog';
import { requestFrameFullscreen } from '../../shared/util/replay-browser';
import { sessionDate } from '../../shared/util/replay-labels';
import {
  isRecord,
  participantOptionLabel,
  plural,
} from '../../shared/util/replay-model';
import {
  derivationLabel,
  shortUrl,
  sourceSessionIdOf,
} from '../../shared/util/session-lineage';
import { eventValue, lit } from '../../shared/util/view-helpers';

/** The app a recording shows, as its tabs or its shell component name it. */
function recordedAppName(
  recorded: ReturnType<typeof session>,
): string | undefined {
  const titled = recorded?.participants?.find(
    (participant) => participant.title && !/^Onglet\s/i.test(participant.title),
  )?.title;
  if (titled) return titled;
  const appShell = recorded?.events.find(
    (event) =>
      event.kind === 'component-lifecycle' &&
      isRecord(event.payload) &&
      typeof event.payload['componentName'] === 'string' &&
      event.payload['componentName'].endsWith('AppShell'),
  );
  const shellName = isRecord(appShell?.payload)
    ? appShell.payload['componentName']
    : undefined;
  return typeof shellName === 'string'
    ? shellName.replace(/AppShell$/, '')
    : undefined;
}

/** The page's title: the app the recording shows, and when it was made. */
export function replaySessionTitle(
  summary: SessionSummary | undefined,
  recorded: ReturnType<typeof session>,
): string {
  const date = summary
    ? sessionDate.format(new Date(summary.createdAt))
    : 'Session importée';
  const appName = recordedAppName(recorded);
  return appName ? `${appName} · ${date}` : date;
}

/** Where it starts, how many tabs, how many events. */
function recordingFacts(recorded: ReturnType<typeof session>): string {
  if (!recorded) return '';
  return [
    shortUrl(recorded.startUrl),
    plural(recorded.participants?.length ?? 1, 'onglet'),
    plural(recorded.events.length, 'événement'),
  ].join(' · ');
}

/**
 * The head of the replay page: which recording this is and where it came from
 * on the left; on the right, the two ways to leave the replay for the live
 * application at the moment it shows. The journal and the other views sit in
 * the rail at the side of the stage, not here.
 */
export const ReplayHead = craftComponent(
  'ReplayHead',
  {},
  function* (input: { readonly pageTitle: ContentSlot }) {
    const replayDebug = yield* ReplayDebug();
    const replaySession = yield* ReplaySession();
    const { setStates } = (yield* ReplayState()).imperative;
    const archive = yield* SessionArchive();
    const savedSessions = archive.sessions.savedSessions;
    const recipes = archive.recipeCatalog.resumeRecipeList;
    const summary = yield* craftComputed('summary', function* () {
      const _savedSessions = yield* savedSessions();
      return _savedSessions.find((item) => item.id === routeSessionId());
    });
    const summaryValue = summary;

    const sessionFacts = yield* craftComputed('sessionFacts', () =>
      recordingFacts(session()),
    );
    const derivation = yield* craftComputed('derivation', function* () {
      const _summaryValue = yield* summaryValue();
      const selected = _summaryValue;
      const _recipes = yield* recipes();
      const _savedSessions = yield* savedSessions();
      return selected
        ? i18n.t('derivationSummary', {
            derivation: derivationLabel(selected, _savedSessions, _recipes),
          })
        : '';
    });
    const sourceId = yield* craftComputed('sourceId', function* () {
      const _summaryValue = yield* summaryValue();
      const selected = _summaryValue;
      const _recipes = yield* recipes();
      return selected ? sourceSessionIdOf(selected, _recipes) : undefined;
    });
    const sourceIdValue = sourceId;
    const sourceKnown = yield* craftComputed('sourceKnown', function* () {
      const _savedSessions = yield* savedSessions();
      const _sourceIdValue = yield* sourceIdValue();
      return _savedSessions.some(
        (item) => item.id === _sourceIdValue,
      );
    });

    const back = button(
      'backToSessions',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'link',
        click: function* () {
          yield* CraftRouter.navigate({ to: '' });
        },
      },
      i18n.t('copy.copy056'),
    );

    const lineage = p(
      {
        class: ui.headLineage,
        'data-lab': 'session-lineage',
        hidden: function* () {
          return (yield* derivation()) === '';
        },
      },
      [
        span(derivation),
        button(
          'openSourceSession',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'link',
            'data-lab': 'open-source-session',
            hidden: function* () {
              return !(yield* sourceKnown());
            },
            click: function* () {
              const _sourceIdValue = yield* sourceIdValue();
              const id = _sourceIdValue;
              if (id)
                yield* CraftRouter.navigate({
                  to: 'sessions/:sessionId',
                  params: { sessionId: id },
                });
            },
          },
          i18n.t('copy.copy057'),
        ),
      ],
    );

    const title = div({ class: ui.headTitle }, [
      back,
      renderContent('pageTitle', input.pageTitle),
      p({ class: ui.headUrl }, sessionFacts),
      lineage,
    ]);

    const tabs = select(
      'participantFilter',
      {
        class: ui.tabSelect,
        value: selectedParticipantId,
        hidden: yield* craftComputed(
          'hidden',
          () => replayableParticipants().length <= 1,
        ),
        change: (event: Event) =>
          replaySession.selectParticipant(eventValue(event)),
        'aria-label': i18n.t('copy.copy058'),
      },
      [
        option({ value: 'all' }, i18n.t('copy.copy059')),
        forNode(
          replayableParticipants,
          { track: (participant) => participant.id },
          (participant) =>
            option(
              {
                value: function* () {
                  const item = yield* participant();
                  return item.id;
                },
              },
              function* () {
                return i18n.t('participantLabel', {
                  participant: participantOptionLabel(yield* participant()),
                });
              },
            ),
        ),
      ],
    );

    const fullscreen = button(
      'fullscreen',
      {
        type: 'button',
        class: iconButtonUi.root,
        'aria-label': i18n.t('copy.copy060'),
        'aria-description': 'Affiche l’application cible en plein écran.',
        'data-tooltip':
          'Agrandit l’application rejouée en plein écran pour l’inspecter.',
        click: () => {
          const participantId = replayParticipantIds()[0];
          if (participantId) requestFrameFullscreen(participantId);
        },
        disabled: yield* craftComputed('disabled', () => !connected()),
      },
      DocIcon({ name: lit('expand'), size: lit('sm') }),
    );

    // Both open the live application in a tab of its own, at the moment the
    // replay shows. One restores what was recorded, right away; the other asks
    // an agent to rebuild it with real data, and keeps the way back.
    const debug = button(
      'debugApp',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'secondary',
        'data-lab': 'debug-app',
        'aria-description':
          'Ouvre l’application vivante dans un nouvel onglet, à l’état où le replay est arrivé.',
        'data-tooltip':
          'Restaure tout de suite l’état enregistré dans un nouvel onglet, sans IA. Idéal pour inspecter.',
        click: replayDebug.launchDebugAppAtReplay,
        disabled: yield* craftComputed('disabled', () => !session()),
      },
      [
        DocIcon({ name: lit('external'), size: lit('sm') }),
        span(i18n.t('copy.copy061')),
      ],
    );

    const resume = button(
      'resumeHere',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'tonal',
        'data-lab': 'resume-here',
        'aria-label': i18n.t('copy.copy062'),
        'aria-description':
          'Demande à un agent IA de rouvrir l’application à ce moment, avec de vraies données.',
        'data-tooltip':
          'Un agent IA reconstruit ce moment dans l’application, avec de vraies données, et laisse un point de reprise et une recette pour y revenir.',
        'aria-haspopup': 'dialog',
        disabled: yield* craftComputed(
          'disabled',
          () => activeRouteSessionId() === undefined,
        ),
        click: () => setStates({ resumeDialogOpen: true }),
      },
      [
        DocIcon({ name: lit('sparkle'), size: lit('sm') }),
        span(i18n.t('copy.copy063')),
      ],
    );

    const momentActions = div(
      {
        class: ui.momentActions,
        role: 'group',
        'aria-label': 'Ouvrir l’application à ce moment du replay',
      },
      [span({ class: ui.momentLabel }, i18n.t('copy.copy064')), debug, resume],
    );

    return div({ class: ui.head }, [
      title,
      div({ class: ui.headTools }, [tabs, momentActions, fullscreen]),
    ]);
  },
);
