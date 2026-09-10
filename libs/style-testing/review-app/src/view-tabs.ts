import {
  button,
  craftComponent,
  small,
  span,
  strong,
  type Input,
  type Output,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import type { DevtoolView } from './devtool-view-state';
import type { Messages } from './messages';

/** The three tabs that switch which devtool view is on screen. */
export const ViewTabs = craftComponent(
  'ViewTabs',
  {},
  (
    devtoolView: Input<DevtoolView>,
    chooseDevtoolView: Output<(view: DevtoolView) => void>,
    visualTestsCount: Input<number>,
    templateObligationsCount: Input<number>,
    cardsCount: Input<number>,
    t: Input<Messages>,
  ) => {
    const visualPressed = craftComputed('visualPressed', function* () {
      return (yield* devtoolView()) === 'visual' ? 'true' : 'false';
    });
    const templatePressed = craftComputed('templatePressed', function* () {
      return (yield* devtoolView()) === 'template' ? 'true' : 'false';
    });
    const reviewPressed = craftComputed('reviewPressed', function* () {
      return (yield* devtoolView()) === 'review' ? 'true' : 'false';
    });

    return {
      chooseDevtoolView,
      visualTestsCount,
      templateObligationsCount,
      cardsCount,
      t,
      visualPressed,
      templatePressed,
      reviewPressed,
    };
  },
  ({
    chooseDevtoolView,
    visualTestsCount,
    templateObligationsCount,
    cardsCount,
    t,
    visualPressed,
    templatePressed,
    reviewPressed,
  }) => [
    button(
      'ShowVisualTests',
      {
        type: 'button',
        class: 'view-tab',
        'aria-pressed': visualPressed,
        *click() {
          yield* chooseDevtoolView('visual');
        },
      },
      [
        span({ class: 'view-tab-icon', 'aria-hidden': 'true' }, '✦'),
        span({ class: 'view-tab-copy' }, [
          strong(function* () {
            return (yield* t()).viewVisual;
          }),
          small(function* () {
            return (yield* t()).viewVisualDescription;
          }),
        ]),
        span({ class: 'view-tab-count' }, function* () {
          return String(yield* visualTestsCount());
        }),
      ],
    ),
    button(
      'ShowTemplateObligations',
      {
        type: 'button',
        class: 'view-tab',
        'aria-pressed': templatePressed,
        *click() {
          yield* chooseDevtoolView('template');
        },
      },
      [
        span({ class: 'view-tab-icon', 'aria-hidden': 'true' }, '⌘'),
        span({ class: 'view-tab-copy' }, [
          strong(function* () {
            return (yield* t()).viewTemplate;
          }),
          small(function* () {
            return (yield* t()).viewTemplateDescription;
          }),
        ]),
        span({ class: 'view-tab-count' }, function* () {
          return String(yield* templateObligationsCount());
        }),
      ],
    ),
    button(
      'ShowReviewQueue',
      {
        type: 'button',
        class: 'view-tab',
        'aria-pressed': reviewPressed,
        *click() {
          yield* chooseDevtoolView('review');
        },
      },
      [
        span({ class: 'view-tab-icon', 'aria-hidden': 'true' }, '✓'),
        span({ class: 'view-tab-copy' }, [
          strong(function* () {
            return (yield* t()).viewReview;
          }),
          small(function* () {
            return (yield* t()).viewReviewDescription;
          }),
        ]),
        span({ class: 'view-tab-count' }, function* () {
          return String(yield* cardsCount());
        }),
      ],
    ),
  ],
);
