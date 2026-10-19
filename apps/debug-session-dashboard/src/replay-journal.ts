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
import { ɵcomputed as computed } from '@craft-ts/core';
import { DocSwitch } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { eventElapsedLabel, journalSummary } from './replay-labels';
import { eventDiagnosticLabel, eventSeverity } from './replay-model';
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
  const filter = div({ class: ui.pager }, [
    p(computed(journalSummary)),
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
          ],
        ),
      ),
    ),
  ]);

  const pager = div(
    {
      class: ui.pager,
      hidden: computed(() => eventTimelinePageCount() <= 1),
    },
    [
      button(
        'previousTimelinePage',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          disabled: computed(() => eventTimelinePage() === 0),
          click: () =>
            eventTimelinePage.set(Math.max(0, eventTimelinePage() - 1)),
        },
        'Événements précédents',
      ),
      span(
        computed(
          () => `${eventTimelinePage() + 1} / ${eventTimelinePageCount()}`,
        ),
      ),
      button(
        'nextTimelinePage',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          disabled: computed(
            () => eventTimelinePage() + 1 >= eventTimelinePageCount(),
          ),
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
