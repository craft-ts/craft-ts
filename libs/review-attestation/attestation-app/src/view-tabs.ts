import {
  button,
  craftComponent,
  small,
  span,
  strong,
  type Input,
  type Output,
} from '@craft-ts/component';
import { craftService, craftComputed } from '@craft-ts/core';
import type { DevtoolView } from './devtool-view-state';
import type { Messages } from './messages';

/** The tabs that switch which devtool view is on screen. */
export const { ViewTabsView, provideViewTabsView } = craftService(
  { name: 'viewTabsView', providedIn: 'toProvide' },
  (inputs: {
    readonly devtoolView: Input<DevtoolView>;
    readonly chooseDevtoolView: Output<(view: DevtoolView) => void>;
    readonly visualTestsCount: Input<number>;
    readonly templateObligationsCount: Input<number>;
    readonly cardsCount: Input<number>;
    readonly t: Input<Messages>;
  }) => {
    const {
      devtoolView,
      chooseDevtoolView,
      visualTestsCount,
      templateObligationsCount,
      cardsCount,
      t,
    } = inputs;

    const applicationPressed = craftComputed(
      'applicationPressed',
      function* () {
        return (yield* devtoolView()) === 'application' ? 'true' : 'false';
      },
    );
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
      applicationPressed,
      visualPressed,
      templatePressed,
      reviewPressed,
    };
  },
);

export const ViewTabs = craftComponent(
  'ViewTabs',
  { providers: [provideViewTabsView()] },
  function* (inputs: {
    readonly devtoolView: Input<DevtoolView>;
    readonly chooseDevtoolView: Output<(view: DevtoolView) => void>;
    readonly visualTestsCount: Input<number>;
    readonly templateObligationsCount: Input<number>;
    readonly cardsCount: Input<number>;
    readonly t: Input<Messages>;
  }) {
    const {
      chooseDevtoolView,
      visualTestsCount,
      templateObligationsCount,
      cardsCount,
      t,
      applicationPressed,
      visualPressed,
      templatePressed,
      reviewPressed,
    } = yield* ViewTabsView(inputs);
    return [
      button(
        'ShowApplicationOverview',
        {
          type: 'button',
          class: 'view-tab',
          'aria-pressed': applicationPressed,
          *click() {
chooseDevtoolView('application');
          },
        },
        [
          span({ class: 'view-tab-icon', 'aria-hidden': 'true' }, '▧'),
          span({ class: 'view-tab-copy' }, [
            strong('Aperçu de l’application'),
            small('Pages, scénarios et formats'),
          ]),
        ],
      ),
      button(
        'ShowVisualTests',
        {
          type: 'button',
          class: 'view-tab',
          'aria-pressed': visualPressed,
          *click() {
chooseDevtoolView('visual');
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
chooseDevtoolView('template');
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
chooseDevtoolView('review');
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
    ];
  },
);
