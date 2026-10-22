import {
  button,
  craftComponent,
  div,
  forNode,
  li,
  p,
  span,
  ul,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { DocSwitch } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { eventElapsedLabel, journalSummary } from './replay-labels';
import { eventDiagnosticLabel, eventSeverity } from './replay-model';
import { launchDebugApp } from './replay-debug';
import { setShowAllEvents } from './replay-session';
import {
  activeReplayEventId,
  eventTimelinePage,
  eventTimelinePageCount,
  showAllEvents,
  visibleEventPage,
} from './replay-state';
import { lit } from './view-helpers';

/**
 * `DocSwitch` hands its `toggle` the state it asks for. The prop shares its
 * name with the DOM `toggle` event, so the type of a handler admits the event
 * as well; only the boolean is ever sent.
 */
function showAllEventsSwitch(next: boolean | Event): void {
  if (typeof next === 'boolean') setShowAllEvents(next);
}

/** The journal: the errors of the recording, or every event, a page at a time. */
export const ReplayJournal = craftComponent('ReplayJournal', {}, function* () {
  const journalSummaryText = yield* craftComputed(
    'journalSummaryText',
    journalSummary,
  );
  const pagerHidden = yield* craftComputed(
    'pagerHidden',
    () => eventTimelinePageCount() <= 1,
  );
  const previousDisabled = yield* craftComputed(
    'previousDisabled',
    () => eventTimelinePage() === 0,
  );
  const pageLabel = yield* craftComputed(
    'pageLabel',
    () => `${eventTimelinePage() + 1} / ${eventTimelinePageCount()}`,
  );
  const nextDisabled = yield* craftComputed(
    'nextDisabled',
    () => eventTimelinePage() + 1 >= eventTimelinePageCount(),
  );

  const filter = div({ class: ui.pager }, [
    p(journalSummaryText),
    DocSwitch({
      label: lit('Tout afficher'),
      controlId: lit('journal-all'),
      on: function* () {
        return showAllEvents();
      },
      disabled: lit(false),
      toggle: showAllEventsSwitch,
    }),
  ]);

  const events = div({ class: ui.scroll }, [
    ul(
      { class: ui.events, 'data-lab': 'events' },
      forNode(visibleEventPage, { track: (event) => event.id }, (event) =>
        li(
          {
            class: ui.event,
            'data-entry': function* () {
              const item = yield* event();
              return (
                eventSeverity(item) ??
                (item.id === activeReplayEventId() ? 'current' : undefined)
              );
            },
          },
          [
            span({ class: ui.eventName }, function* () {
              return eventDiagnosticLabel(yield* event());
            }),
            span({ class: ui.eventMeta }, [
              span(function* () {
                const item = yield* event();
                return `${item.kind} · ${item.phase}`;
              }),
              span(function* () {
                return eventElapsedLabel(yield* event());
              }),
            ]),
            button(
              'debugFromEvent',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'link',
                'data-lab': 'debug-from-event',
                'aria-description':
                  'Ouvre l’application en mode debug, à l’état qu’elle avait juste avant cet événement.',
                'data-tooltip':
                  'Ouvre l’application dans un nouvel onglet, à l’état d’avant cet événement.',
                click: function* () {
                  const item = yield* event();
                  launchDebugApp(item.sequence, item.participantId);
                },
              },
              'Déboguer ici',
            ),
          ],
        ),
      ),
    ),
  ]);

  const pager = div(
    {
      class: ui.pager,
      hidden: pagerHidden,
    },
    [
      button(
        'previousTimelinePage',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          disabled: previousDisabled,
          click: () =>
            eventTimelinePage.set(Math.max(0, eventTimelinePage() - 1)),
        },
        'Événements précédents',
      ),
      span(pageLabel),
      button(
        'nextTimelinePage',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          disabled: nextDisabled,
          click: () =>
            eventTimelinePage.set(
              Math.min(eventTimelinePageCount() - 1, eventTimelinePage() + 1),
            ),
        },
        'Événements suivants',
      ),
    ],
  );

  return div({ class: ui.sideBody }, [filter, events, pager]);
});
