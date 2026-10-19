import {
  button,
  craftComponent,
  div,
  forNode,
  heading,
  option,
  p,
  select,
} from '@craft-ts/component';
import { rawReactiveValue, ɵcomputed as computed } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { goToHash, requestFrameFullscreen } from './replay-browser';
import { sessionDate } from './replay-labels';
import { participantOptionLabel } from './replay-model';
import { selectParticipant } from './replay-session';
import {
  connected,
  errorCount,
  replayableParticipants,
  replayParticipantIds,
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
    heading({ class: ui.headName }, computed(sessionTitle)),
    p(
      { class: ui.headUrl },
      computed(() => session()?.startUrl ?? ''),
    ),
  ]);

  const tabs = select(
    'participantFilter',
    {
      class: ui.tabSelect,
      value: selectedParticipantId,
      hidden: computed(() => replayableParticipants().length <= 1),
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
      disabled: computed(() => !connected()),
    },
    'Plein écran',
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

  return div({ class: ui.head }, [
    back,
    title,
    div({ class: ui.headTools }, [tabs, fullscreen, journal]),
  ]);
});
