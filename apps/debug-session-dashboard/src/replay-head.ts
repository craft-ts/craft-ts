import {
  button,
  craftComponent,
  div,
  forNode,
  heading,
  option,
  p,
  select,
  span,
} from '@craft-ts/component';
import { craftComputed, rawReactiveValue } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { goToHash, requestFrameFullscreen } from './replay-browser';
import {
  launchDebugAppAtReplay,
  openResumeCheckpoint,
  replayPoint,
} from './replay-debug';
import { sessionDate } from './replay-labels';
import {
  isRecord,
  parseLocalTarget,
  participantOptionLabel,
} from './replay-model';
import { selectParticipant } from './replay-session';
import {
  connected,
  differenceHistoryOpen,
  errorCount,
  isReplayErrorNote,
  pendingWarnings,
  replayWarnings,
  warningHistoryOpen,
  replayableParticipants,
  replayParticipantIds,
  replayDifferences,
  routeSessionId,
  selectedParticipantId,
  session,
  sidePanelOpen,
  targetUrl,
} from './replay-state';
import { copyResumePrompt, resumePrompt } from './resume-prompt';
import {
  SessionArchive,
  type ResumeCheckpointSummary,
} from './session-archive.service';
import { eventValue } from './view-helpers';

/** What to tell the AI host once the point is published. */
/** A point frozen for this very event, on the app the dashboard drives. */
function readyCheckpointFor(
  checkpoints: readonly ResumeCheckpointSummary[],
  target: string,
  beforeSequence: number | undefined,
): ResumeCheckpointSummary | undefined {
  const parsed = parseLocalTarget(target.trim());
  const origin = parsed.ok ? parsed.url.origin : undefined;
  return checkpoints.find(
    (checkpoint) =>
      !checkpoint.expired &&
      checkpoint.origin === origin &&
      checkpoint.beforeSequence === beforeSequence,
  );
}

/** The head of the replay page: the way back, which session, and the tools. */
export const ReplayHead = craftComponent('ReplayHead', {}, function* () {
  const archive = yield* SessionArchive();
  const savedSessions = rawReactiveValue(archive.savedSessions);
  const sessionTitle = () => {
    const selected = savedSessions().find(
      (item) => item.id === routeSessionId(),
    );
    const date = selected
      ? sessionDate.format(new Date(selected.createdAt))
      : 'Session importée';
    const recorded = session();
    const recordedTitle = recorded?.participants?.find(
      (participant) =>
        participant.title && !/^Onglet\s/i.test(participant.title),
    )?.title;
    const appShell = recorded?.events.find(
      (event) =>
        event.kind === 'component-lifecycle' &&
        isRecord(event.payload) &&
        typeof event.payload['componentName'] === 'string' &&
        event.payload['componentName'].endsWith('AppShell'),
    );
    const appShellName = isRecord(appShell?.payload)
      ? appShell.payload['componentName']
      : undefined;
    const appName =
      recordedTitle ??
      (typeof appShellName === 'string'
        ? appShellName.replace(/AppShell$/, '')
        : undefined);
    return appName ? `${appName} · ${date}` : date;
  };
  const sessionTitleText = yield* craftComputed(
    'sessionTitleText',
    sessionTitle,
  );
  const startUrl = yield* craftComputed(
    'startUrl',
    () => session()?.startUrl ?? '',
  );
  const participantFilterHidden = yield* craftComputed(
    'participantFilterHidden',
    () => replayableParticipants().length <= 1,
  );
  const fullscreenDisabled = yield* craftComputed(
    'fullscreenDisabled',
    () => !connected(),
  );
  const debugDisabled = yield* craftComputed('debugDisabled', () => !session());
  const differenceCount = yield* craftComputed('differenceCount', () =>
    String(replayDifferences().length),
  );
  const notesHidden = yield* craftComputed(
    'notesHidden',
    () => replayWarnings().length === 0,
  );
  const hasReplayErrorNote = yield* craftComputed(
    'hasReplayErrorNote',
    () => replayWarnings().some(isReplayErrorNote),
  );
  const warningCount = yield* craftComputed('warningCount', () =>
    String(replayWarnings().length),
  );

  const back = button(
    'backToSessions',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': 'link',
      click: () => {
        goToHash('#/');
      },
    },
    '← Sessions',
  );

  const title = div({ class: ui.headTitle }, [
    heading({ class: ui.headName }, sessionTitleText),
    p({ class: ui.headUrl }, startUrl),
  ]);

  const tabs = select(
    'participantFilter',
    {
      class: ui.tabSelect,
      value: selectedParticipantId,
      hidden: participantFilterHidden,
      change: (event: Event) => selectParticipant(eventValue(event)),
      'aria-label': 'Onglets à visionner',
    },
    [
      option({ value: 'all' }, 'Tous les onglets'),
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
              return participantOptionLabel(yield* participant());
            },
          ),
      ),
    ],
  );

  const fullscreen = button(
    'fullscreen',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': 'secondary',
      'aria-description': 'Affiche l’application cible en plein écran.',
      'data-tooltip':
        'Agrandit l’application cible en plein écran pour inspecter le replay.',
      click: () => {
        const participantId = replayParticipantIds()[0];
        if (participantId) requestFrameFullscreen(participantId);
      },
      disabled: fullscreenDisabled,
    },
    'Plein écran',
  );

  const debug = button(
    'debugApp',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': 'secondary',
      'data-lab': 'debug-app',
      'aria-description':
        'Ouvre l’application en mode debug, à l’état où le replay est arrivé.',
      'data-tooltip':
        'Ouvre l’application dans un nouvel onglet, vivante, à l’état du replay en cours, pour investiguer.',
      click: launchDebugAppAtReplay,
      disabled: debugDisabled,
    },
    'Déboguer ici',
  );

  const resumeRequestSending = rawReactiveValue(archive.resumeRequestSending);
  const resumeRequestFailed = rawReactiveValue(archive.resumeRequestFailed);
  const resumeCheckpoints = rawReactiveValue(archive.resumeCheckpointList);
  const readyCheckpoint = yield* craftComputed('readyCheckpoint', () =>
    readyCheckpointFor(
      resumeCheckpoints(),
      targetUrl(),
      replayPoint().beforeSequence,
    ),
  );
  const resumeDisabled = yield* craftComputed(
    'resumeDisabled',
    () => routeSessionId() === undefined || resumeRequestSending(),
  );
  const resume = button(
    'resumeHere',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': 'secondary',
      'data-lab': 'resume-here',
      'aria-label': 'Reprendre ici',
      'aria-description':
        'Demande à l’IA de ramener l’application vivante au point du replay.',
      'data-tooltip': yield* craftComputed('resumeTooltip', function* () {
        const ready = yield* readyCheckpoint();
        return ready
          ? `Rouvre le point de reprise enregistré (valide jusqu’au ${new Date(ready.expiresAt).toLocaleString('fr-FR')} : ${ready.ttlReason}).`
          : 'Publie ce point pour l’IA (outil resume.request) et copie l’invite à lui donner.';
      }),
      disabled: resumeDisabled,
      click: function* () {
        const ready = yield* readyCheckpoint();
        if (ready) {
          openResumeCheckpoint(ready);
          return;
        }
        const sessionId = routeSessionId();
        if (sessionId === undefined) return;
        const point = replayPoint();
        const prompt = resumePrompt(sessionId, point.beforeSequence);
        copyResumePrompt(prompt);
        yield* archive.requestResume({ sessionId, ...point }, prompt);
      },
    },
    yield* craftComputed('resumeLabel', function* () {
      const ready = yield* readyCheckpoint();
      return resumeRequestFailed()
        ? 'Reprise : archive injoignable'
        : ready
          ? 'Reprendre ici · point prêt'
          : 'Reprendre ici';
    }),
  );

  const journal = button(
    'toggleJournal',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': function* () {
        return errorCount() > 0 ? 'tonal' : 'secondary';
      },
      'aria-expanded': function* () {
        return sidePanelOpen() ? 'true' : 'false';
      },
      click: () => sidePanelOpen.set(!sidePanelOpen()),
    },
    'Journal',
  );

  const differences = button(
    'toggleDifferences',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': function* () {
        return replayDifferences().length > 0 ? 'tonal' : 'secondary';
      },
      'aria-label': function* () {
        return `${replayDifferences().length} décalage(s) détecté(s)`;
      },
      'aria-expanded': function* () {
        return differenceHistoryOpen() ? 'true' : 'false';
      },
      'data-lab': 'toggle-differences',
      click: () => differenceHistoryOpen.set(!differenceHistoryOpen()),
    },
    [span({ 'aria-hidden': 'true' }, '⚠'), span(differenceCount)],
  );

  const notes = div(
    {
      class: ui.noteAnchor,
      hidden: notesHidden,
    },
    [
      button(
        'toggleNotes',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': function* () {
            return pendingWarnings().length > 0 ? 'tonal' : 'secondary';
          },
          'aria-label': function* () {
            return `${replayWarnings().length} note(s) du replay`;
          },
          'aria-expanded': function* () {
            return warningHistoryOpen() ? 'true' : 'false';
          },
          'data-lab': 'toggle-notes',
          click: () => warningHistoryOpen.set(!warningHistoryOpen()),
        },
        span({ class: ui.noteIcon, 'aria-hidden': 'true' }, '🗒'),
      ),
      span(
        {
          class: ui.noteBadge,
          'data-note-badge': function* () {
            return (yield* hasReplayErrorNote()) ? 'error' : undefined;
          },
          'data-lab': 'notes-count',
          'aria-hidden': 'true',
        },
        warningCount,
      ),
    ],
  );

  return div({ class: ui.head }, [
    back,
    title,
    div({ class: ui.headTools }, [
      tabs,
      debug,
      resume,
      fullscreen,
      notes,
      differences,
      journal,
    ]),
  ]);
});
