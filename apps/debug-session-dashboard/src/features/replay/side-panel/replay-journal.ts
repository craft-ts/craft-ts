import {
  button,
  content,
  craftComponent,
  div,
  forNode,
  li,
  p,
  span,
  ul,
} from '@craft-ts/component';
import { DocIcon, DocSwitch, DocTooltip } from '@craft-ts/ui';
import { buttonUi, iconButtonUi } from '@craft-ts/ui/style';
import { ReplayDebug } from '../../../shared/state/replay-debug';
import { ReplaySession } from '../../../shared/state/replay-session';
import {
  activeReplayEventId,
  eventTimelinePage,
  eventTimelinePageCount,
  ReplayState,
  showAllEvents,
  visibleEventPage,
} from '../../../shared/state/replay-state';
import { ui } from '../../../shared/ui/dashboard.style';
import { i18n } from '../../../shared/util/catalog';
import { eventElapsedLabel } from '../../../shared/util/replay-labels';
import {
  eventDiagnosticLabel,
  eventSeverity,
} from '../../../shared/util/replay-model';
import { lit } from '../../../shared/util/view-helpers';
import { ReplayOrchestration } from './replay-orchestration';
import { ReplaySidePanelViewModel } from './replay-side-panel-view-model.service';

/** The journal: the errors of the recording, or every event, a page at a time. */
export const ReplayJournal = craftComponent('ReplayJournal', {}, function* () {
  const filter = div({ class: ui.pager }, [
    p(function* () {
      return yield* (yield* ReplaySidePanelViewModel()).journalSummaryText();
    }),
    DocSwitch({
      label: lit('Tout afficher'),
      controlId: lit('journal-all'),
      on: function* () {
        return showAllEvents();
      },
      disabled: lit(false),
      toggle: function* (next: boolean | Event) {
        if (typeof next === 'boolean')
          (yield* ReplaySession()).setShowAllEvents(next);
      },
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
            'aria-label': i18n.t('copy.copy065'),
            'aria-describedby': tipId,
            click: function* () {
              const item = yield* event();
              (yield* ReplayDebug()).launchDebugApp(
                item.sequence,
                item.participantId,
              );
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
      hidden: function* () {
        return yield* (yield* ReplaySidePanelViewModel()).pagerHidden();
      },
    },
    [
      button(
        'previousTimelinePage',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          disabled: function* () {
            return yield* (yield* ReplaySidePanelViewModel()).previousDisabled();
          },
          click: function* () {
            (yield* ReplayState()).imperative.setStates({
              eventTimelinePage: Math.max(0, eventTimelinePage() - 1),
            });
          },
        },
        i18n.t('copy.copy066'),
      ),
      span(function* () {
        return yield* (yield* ReplaySidePanelViewModel()).pageLabel();
      }),
      button(
        'nextTimelinePage',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          disabled: function* () {
            return yield* (yield* ReplaySidePanelViewModel()).nextDisabled();
          },
          click: function* () {
            (yield* ReplayState()).imperative.setStates({
              eventTimelinePage: Math.min(
                eventTimelinePageCount() - 1,
                eventTimelinePage() + 1,
              ),
            });
          },
        },
        i18n.t('copy.copy067'),
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
