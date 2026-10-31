import { craftComponent, div, p, span, type Output } from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { assign, unit } from '@craft-ts/style';
import { progressVars, ui } from './dashboard.style';
import { pointerShare } from './replay-browser';
import {
  currentNextActionLabel,
  nextActionTimingLabel,
  progressLabel,
  replayDurationMs,
  replayElapsedMs,
  replayElapsedShare,
  scrubValueText,
  timeProgressLabel,
  timeRemainingLabel,
} from './replay-labels';
import { seekReplayToIndex, seekReplayToShare } from './replay-session';
import { replayIndex, replayableEvents } from './replay-state';
import {
  ReplayThumbnailMarks,
  ReplayThumbnailsStatus,
} from './replay-thumbnails';

/** The arrow keys walk the recording an action at a time; Home and End go to its ends. */
function scrubKey(event: KeyboardEvent): void {
  const total = replayableEvents().length;
  const target = {
    ArrowRight: replayIndex() + 1,
    ArrowLeft: replayIndex() - 1,
    Home: 0,
    End: total,
  }[event.key];
  if (target === undefined || total === 0) return;
  event.preventDefault();
  seekReplayToIndex(target);
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
  function* (inputs: { readonly retryThumbnails: Output<() => void> }) {
    const { retryThumbnails } = inputs;
    const ariaValueMax = yield* craftComputed('ariaValueMax', () =>
      Math.round(replayDurationMs() / 1000),
    );
    const ariaValueNow = yield* craftComputed('ariaValueNow', () =>
      Math.round(replayElapsedMs() / 1000),
    );
    const ariaValueText = yield* craftComputed('ariaValueText', scrubValueText);
    const ariaDisabled = yield* craftComputed('ariaDisabled', () =>
      replayableEvents().length === 0 ? 'true' : 'false',
    );
    const timeProgress = yield* craftComputed(
      'timeProgress',
      timeProgressLabel,
    );
    const timeRemaining = yield* craftComputed(
      'timeRemaining',
      timeRemainingLabel,
    );
    const timelineProgress = yield* craftComputed(
      'timelineProgress',
      progressLabel,
    );
    const nextAction = yield* craftComputed(
      'nextAction',
      currentNextActionLabel,
    );
    const nextActionTimingHidden = yield* craftComputed(
      'nextActionTimingHidden',
      () => nextActionTimingLabel() === '',
    );
    const nextActionTimingText = yield* craftComputed(
      'nextActionTimingText',
      () => ` · ${nextActionTimingLabel()}`,
    );

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
        'aria-valuemax': ariaValueMax,
        'aria-valuenow': ariaValueNow,
        'aria-valuetext': ariaValueText,
        'aria-disabled': ariaDisabled,
        click: (event: MouseEvent) => seekReplayToShare(pointerShare(event)),
        keydown: scrubKey,
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
        p({ class: ui.progressLabel, 'data-lab': 'replay-time' }, timeProgress),
        p(
          { class: ui.progressLabel, 'data-lab': 'replay-time-remaining' },
          timeRemaining,
        ),
      ]),
      div({ class: ui.timelineStep }, [
        p(
          {
            class: ui.progressLabel,
            'data-lab': 'replay-progress',
            role: 'status',
          },
          timelineProgress,
        ),
        p({ class: ui.next }, [
          span(
            { class: ui.nextName, 'data-lab': 'next-action-name' },
            nextAction,
          ),
          span(
            {
              class: ui.nextTiming,
              'data-lab': 'next-action-timing',
              role: 'timer',
              hidden: nextActionTimingHidden,
            },
            nextActionTimingText,
          ),
        ]),
      ]),
      ReplayThumbnailsStatus({ retryThumbnails }),
    ]);

    return div({ class: ui.timeline, 'data-lab': 'replay-timeline' }, [
      div({ class: ui.scrubber }, [slider, ReplayThumbnailMarks({})]),
      info,
    ]);
  },
);
