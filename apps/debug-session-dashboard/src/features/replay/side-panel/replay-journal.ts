import { i18n } from '../../../shared/util/catalog';
import {
  button,
  craftComponent,
  content,
  div,
  forNode,
  li,
  p,
  span,
  ul,
} from '@craft-ts/component';
import { craftComputed, rawReactiveValue } from '@craft-ts/core';
import { DocIcon, DocSwitch, DocTooltip } from '@craft-ts/ui';
import { buttonUi, iconButtonUi } from '@craft-ts/ui/style';
import { ui } from '../../../shared/ui/dashboard.style';
import { eventElapsedLabel, journalSummary } from '../../../shared/util/replay-labels';
import { eventDiagnosticLabel, eventSeverity } from '../../../shared/util/replay-model';
import { ReplayOrchestration } from './replay-orchestration';
import { ReplayDebug } from '../../../shared/state/replay-debug';
import { ReplaySession } from '../../../shared/state/replay-session';
import {
  activeReplayEventId,
  eventTimelinePageCount,
  ReplayState,
  showAllEvents,
  visibleEventPage,
} from '../../../shared/state/replay-state';
import { lit } from '../../../shared/util/view-helpers';

/**
 * `DocSwitch` hands its `toggle` the state it asks for. The prop shares its
 * name with the DOM `toggle` event, so the type of a handler admits the event
 * as well; only the boolean is ever sent.
 */
function showAllEventsSwitch(
  next: boolean | Event,
  setShowAllEvents: (next: boolean) => void,
): void {
  if (typeof next === 'boolean') setShowAllEvents(next);
}

/** The journal: the errors of the recording, or every event, a page at a time. */
export const ReplayJournal = craftComponent('ReplayJournal', {}, function* () {
  const replayDebug = yield* ReplayDebug();
  const replaySession = yield* ReplaySession();
  const { eventTimelinePage, setStates } =
    (yield* ReplayState()).imperative;
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
    function* () { return (yield* eventTimelinePage()) === 0; },
  );
  const pageLabel = yield* craftComputed(
    'pageLabel',
    function* () { return `${(yield* eventTimelinePage()) + 1} / ${eventTimelinePageCount()}`; },
  );
  const nextDisabled = yield* craftComputed(
    'nextDisabled',
    function* () { return (yield* eventTimelinePage()) + 1 >= eventTimelinePageCount(); },
  );

  const filter = div({ class: ui.pager }, [
    p(journalSummaryText),
    DocSwitch({
      label: lit('Tout afficher'),
      controlId: lit('journal-all'),
      on: showAllEvents,
      disabled: lit(false),
      toggle: (next: boolean | Event) =>
        showAllEventsSwitch(next, replaySession.setShowAllEvents),
    }),
  ]);

  const events = div({ class: ui.scroll }, [
    ul(
      { class: ui.events, 'data-lab': 'events' },
      forNode(visibleEventPage, { track: (event) => event.id }, (event) => {
        const tipId = function* () {
          return `journal-debug-tip-${(yield* event()).id}`;
        };
        const debugButton = button(
          'debugFromEvent',
          {
            type: 'button',
            class: [iconButtonUi.root, ui.eventAction],
            'data-lab': 'debug-from-event',
            'aria-label': i18n.t("copy.copy065"),
            'aria-describedby': tipId,
            click: function* () {
              const item = yield* event();
              replayDebug.launchDebugApp(item.sequence, item.participantId);
            },
          },
          DocIcon({ name: lit('external'), size: lit('sm') }),
        );

        return li(
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
            div({ class: ui.eventInfo }, [
              span({ class: ui.eventName }, function* () {
                return i18n.t('eventDiagnosticLabel', {
                  eventDiagnostic: eventDiagnosticLabel(yield* event()),
                });
              }),
              span({ class: ui.eventMeta }, [
                span(function* () {
                  const item = yield* event();
                  return `${item.kind} · ${item.phase}`;
                }),
                span(function* () {
                  return i18n.t('elapsedLabel', {
                    elapsed: eventElapsedLabel(yield* event()),
                  });
                }),
              ]),
            ]),
            DocTooltip({
              tip: lit('Ouvre l’application à l’état d’avant cet événement.'),
              tipId,
              placement: lit('left'),
              body: content(() => debugButton),
            }),
          ],
        );
      }),
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
            setStates({
              eventTimelinePage: Math.max(
                0,
                rawReactiveValue(eventTimelinePage)() - 1,
              ),
            }),
        },
        i18n.t("copy.copy066"),
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
            setStates({
              eventTimelinePage: Math.min(
                eventTimelinePageCount() - 1,
                rawReactiveValue(eventTimelinePage)() + 1,
              ),
            }),
        },
        i18n.t("copy.copy067"),
      ),
    ],
  );

  return div({ class: ui.sideBody }, [
    ReplayOrchestration({}),
    filter,
    events,
    pager,
  ]);
});
