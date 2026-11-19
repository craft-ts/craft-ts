import { craftComponent, div, p, span, type Input } from '@craft-ts/component';
import { assign, unit } from '@craft-ts/style';
import { progressVars, ui } from '../../../shared/ui/dashboard.style';
import { pointerShare } from '../../../shared/util/replay-browser';
import { replayElapsedShare } from '../../../shared/util/replay-labels';
import { ReplayPageViewModel } from '../replay-page-view-model.service';
import { ReplaySession } from '../../../shared/state/replay-session';
import {
  replayIndex,
  replayableEvents,
} from '../../../shared/state/replay-state';
import {
  ReplayThumbnailMarks,
  ReplayThumbnailsStatus,
} from './replay-thumbnails';

/** The arrow keys walk the recording an action at a time; Home and End go to its ends. */
function scrubTarget(
  event: KeyboardEvent,
  index: number,
  total: number,
): number | undefined {
  const target = {
    ArrowRight: index + 1,
    ArrowLeft: index - 1,
    Home: 0,
    End: total,
  }[event.key];
  if (target === undefined || total === 0) return undefined;
  event.preventDefault();
  return target;
}

/**
 * The timeline of the recording, under the pages it replays: a bar that shows how
 * far the replay is and takes it to any other moment with a click, the points
 * where a picture was taken (the picture opens when one is hovered), and the
 * clock, the step and the next action in one line.
 */
export const ReplayTimeline = craftComponent(
  'ReplayTimeline',
  {},
  function* (inputs: { readonly retryThumbnails: Input<() => void> }) {
    const { retryThumbnails } = inputs;
    const share = function* () {
      return assign(progressVars.done, unit.pct(replayElapsedShare()));
    };

    const slider = div(
      'scrubSlider',
      {
        class: ui.scrubSlider,
        role: 'slider',
        tabIndex: 0,
        'data-lab': 'replay-scrubber',
        'aria-label': 'Position dans l’enregistrement',
        'aria-valuemin': 0,
        'aria-valuemax': function* () {
          return yield* (yield* ReplayPageViewModel()).ariaValueMax();
        },
        'aria-valuenow': function* () {
          return yield* (yield* ReplayPageViewModel()).ariaValueNow();
        },
        'aria-valuetext': function* () {
          return yield* (yield* ReplayPageViewModel()).ariaValueText();
        },
        'aria-disabled': function* () {
          return yield* (yield* ReplayPageViewModel()).ariaDisabled();
        },
        click: function* (event: MouseEvent) {
          (yield* ReplaySession()).seekReplayToShare(pointerShare(event));
        },
        keydown: function* (event: KeyboardEvent) {
          const target = scrubTarget(
            event,
            replayIndex(),
            replayableEvents().length,
          );
          if (target !== undefined)
            (yield* ReplaySession()).seekReplayToIndex(target);
        },
      },
      [
        div({ class: ui.scrubTrack }, [
          div({
            class: ui.scrubFill,
            'data-lab': 'replay-time-fill',
            style: share,
          }),
        ]),
        div({ class: ui.scrubHead, style: share }),
      ],
    );

    const info = div({ class: ui.timelineInfo }, [
      div({ class: ui.timelineClock }, [
        p({ class: ui.progressLabel, 'data-lab': 'replay-time' }, function* () {
          return yield* (yield* ReplayPageViewModel()).timeProgress();
        }),
        p(
          { class: ui.progressLabel, 'data-lab': 'replay-time-remaining' },
          function* () {
            return yield* (yield* ReplayPageViewModel()).timeRemaining();
          },
        ),
      ]),
      div({ class: ui.timelineStep }, [
        p(
          {
            class: ui.progressLabel,
            'data-lab': 'replay-progress',
            role: 'status',
          },
          function* () {
            return yield* (yield* ReplayPageViewModel()).timelineProgress();
          },
        ),
        p({ class: ui.next }, [
          span(
            { class: ui.nextName, 'data-lab': 'next-action-name' },
            function* () {
              return yield* (yield* ReplayPageViewModel()).nextAction();
            },
          ),
          span(
            {
              class: ui.nextTiming,
              'data-lab': 'next-action-timing',
              role: 'timer',
              hidden: function* () {
                return yield* (yield* ReplayPageViewModel()).nextActionTimingHidden();
              },
            },
            function* () {
              return yield* (yield* ReplayPageViewModel()).nextActionTimingText();
            },
          ),
        ]),
      ]),
      ReplayThumbnailsStatus({
        retryThumbnails,
      }),
    ]);

    return div({ class: ui.timeline, 'data-lab': 'replay-timeline' }, [
      div({ class: ui.scrubber }, [slider, ReplayThumbnailMarks({})]),
      info,
    ]);
  },
);
