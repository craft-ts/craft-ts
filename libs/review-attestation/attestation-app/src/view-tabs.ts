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
import { viewTabs } from './view-tabs.style';

/** The tabs that switch which devtool view is on screen. */
export const ViewTabs = craftComponent(
  'ViewTabs',
  {},
  (
    devtoolView: Input<DevtoolView>,
    chooseDevtoolView: Output<(view: DevtoolView) => void>,
    visualTestsCount: Input<number>,
    templateObligationsCount: Input<number>,
    folderLayoutCount: Input<number>,
    bypassesCount: Input<number>,
    cardsCount: Input<number>,
    t: Input<Messages>,
  ) => {
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
    const folderLayoutPressed = craftComputed(
      'folderLayoutPressed',
      function* () {
        return (yield* devtoolView()) === 'folder-layout' ? 'true' : 'false';
      },
    );
    const bypassesPressed = craftComputed('bypassesPressed', function* () {
      return (yield* devtoolView()) === 'bypasses' ? 'true' : 'false';
    });

    return {
      chooseDevtoolView,
      devtoolView,
      visualTestsCount,
      templateObligationsCount,
      folderLayoutCount,
      bypassesCount,
      cardsCount,
      t,
      applicationPressed,
      visualPressed,
      templatePressed,
      reviewPressed,
      folderLayoutPressed,
      bypassesPressed,
    };
  },
  ({
    chooseDevtoolView,
    visualTestsCount,
    templateObligationsCount,
    folderLayoutCount,
    bypassesCount,
    cardsCount,
    t,
    applicationPressed,
    visualPressed,
    templatePressed,
    reviewPressed,
    folderLayoutPressed,
    bypassesPressed,
  }) => [
    button(
      'ShowApplicationOverview',
      {
        type: 'button',
        class: viewTabs.tab,
        'aria-pressed': applicationPressed,
        *click() {
          yield* chooseDevtoolView('application');
        },
      },
      [
        span(
          {
            class: viewTabs.icon,
            'data-testid': 'view-tab-icon',
            'aria-hidden': 'true',
          },
          '▧',
        ),
        span({ class: viewTabs.copy }, [
          strong({ class: viewTabs.title }, 'Aperçu de l’application'),
          small({ class: viewTabs.hint }, 'Pages, scénarios et formats'),
        ]),
      ],
    ),
    button(
      'ShowVisualTests',
      {
        type: 'button',
        class: viewTabs.tab,
        'aria-pressed': visualPressed,
        *click() {
          yield* chooseDevtoolView('visual');
        },
      },
      [
        span(
          {
            class: viewTabs.icon,
            'data-testid': 'view-tab-icon',
            'aria-hidden': 'true',
          },
          '✦',
        ),
        span({ class: viewTabs.copy }, [
          strong({ class: viewTabs.title }, function* () {
            return (yield* t()).viewVisual;
          }),
          small({ class: viewTabs.hint }, function* () {
            return (yield* t()).viewVisualDescription;
          }),
        ]),
        span(
          { class: viewTabs.count, 'data-testid': 'view-tab-count' },
          function* () {
            return String(yield* visualTestsCount());
          },
        ),
      ],
    ),
    button(
      'ShowTemplateObligations',
      {
        type: 'button',
        class: viewTabs.tab,
        'aria-pressed': templatePressed,
        *click() {
          yield* chooseDevtoolView('template');
        },
      },
      [
        span(
          {
            class: viewTabs.icon,
            'data-testid': 'view-tab-icon',
            'aria-hidden': 'true',
          },
          '⌘',
        ),
        span({ class: viewTabs.copy }, [
          strong({ class: viewTabs.title }, function* () {
            return (yield* t()).viewTemplate;
          }),
          small({ class: viewTabs.hint }, function* () {
            return (yield* t()).viewTemplateDescription;
          }),
        ]),
        span(
          { class: viewTabs.count, 'data-testid': 'view-tab-count' },
          function* () {
            return String(yield* templateObligationsCount());
          },
        ),
      ],
    ),
    button(
      'ShowReviewQueue',
      {
        type: 'button',
        class: viewTabs.tab,
        'aria-pressed': reviewPressed,
        *click() {
          yield* chooseDevtoolView('review');
        },
      },
      [
        span(
          {
            class: viewTabs.icon,
            'data-testid': 'view-tab-icon',
            'aria-hidden': 'true',
          },
          '✓',
        ),
        span({ class: viewTabs.copy }, [
          strong({ class: viewTabs.title }, function* () {
            return (yield* t()).viewReview;
          }),
          small({ class: viewTabs.hint }, function* () {
            return (yield* t()).viewReviewDescription;
          }),
        ]),
        span(
          { class: viewTabs.count, 'data-testid': 'view-tab-count' },
          function* () {
            return String(yield* cardsCount());
          },
        ),
      ],
    ),
    button(
      'ShowFolderLayout',
      {
        type: 'button',
        class: viewTabs.tab,
        'aria-pressed': folderLayoutPressed,
        *click() {
          yield* chooseDevtoolView('folder-layout');
        },
      },
      [
        span(
          {
            class: viewTabs.icon,
            'data-testid': 'view-tab-icon',
            'aria-hidden': 'true',
          },
          '⇄',
        ),
        span({ class: viewTabs.copy }, [
          strong({ class: viewTabs.title }, function* () {
            return (yield* t()).viewFolderLayout;
          }),
          small({ class: viewTabs.hint }, function* () {
            return (yield* t()).viewFolderLayoutDescription;
          }),
        ]),
        span(
          { class: viewTabs.count, 'data-testid': 'view-tab-count' },
          function* () {
            return String(yield* folderLayoutCount());
          },
        ),
      ],
    ),
    button(
      'ShowBypasses',
      {
        type: 'button',
        class: viewTabs.tab,
        'aria-pressed': bypassesPressed,
        *click() {
          yield* chooseDevtoolView('bypasses');
        },
      },
      [
        span(
          {
            class: viewTabs.icon,
            'data-testid': 'view-tab-icon',
            'aria-hidden': 'true',
          },
          '⚑',
        ),
        span({ class: viewTabs.copy }, [
          strong({ class: viewTabs.title }, function* () {
            return (yield* t()).viewBypasses;
          }),
          small({ class: viewTabs.hint }, function* () {
            return (yield* t()).viewBypassesDescription;
          }),
        ]),
        span(
          { class: viewTabs.count, 'data-testid': 'view-tab-count' },
          function* () {
            return String(yield* bypassesCount());
          },
        ),
      ],
    ),
  ],
);
