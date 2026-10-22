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
import { launchDebugAppAtReplay } from './replay-debug';
import { sessionDate } from './replay-labels';
import { participantOptionLabel } from './replay-model';
import { selectParticipant } from './replay-session';
import {
  connected,
  differenceHistoryOpen,
  errorCount,
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
} from './replay-state';
import { SessionArchive } from './session-archive.service';
import { eventValue } from './view-helpers';

/** The head of the replay page: the way back, which session, and the tools. */
export const ReplayHead = craftComponent('ReplayHead', {}, function* () {
  const archive = yield* SessionArchive();
  const savedSessions = rawReactiveValue(archive.savedSessions);
  const sessionTitle = () => {
    const selected = savedSessions().find(
      (item) => item.id === routeSessionId(),
    );
    return selected
      ? sessionDate.format(new Date(selected.createdAt))
      : 'Session importée';
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
      fullscreen,
      notes,
      differences,
      journal,
    ]),
  ]);
});
