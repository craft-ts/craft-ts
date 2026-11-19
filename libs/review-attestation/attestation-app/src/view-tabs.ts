import {
  button,
  craftComponent,
  small,
  span,
  strong,
  type Input,
  type Output,
} from '@craft-ts/component';
import type { DevtoolView } from './devtool-view-state';
import type { Messages } from './messages';
import { viewTabs } from './view-tabs.style';

/** The tabs that switch which devtool view is on screen. */
export const ViewTabs = craftComponent(
  'ViewTabs',
  {},
  function* ({
    devtoolView,
    chooseDevtoolView,
    visualTestsCount,
    templateObligationsCount,
    folderLayoutCount,
    bypassesCount,
    cardsCount,
    t,
  }: {
    readonly devtoolView: Input<DevtoolView>;
    readonly chooseDevtoolView: Output<(view: DevtoolView) => void>;
    readonly visualTestsCount: Input<number>;
    readonly templateObligationsCount: Input<number>;
    readonly folderLayoutCount: Input<number>;
    readonly bypassesCount: Input<number>;
    readonly cardsCount: Input<number>;
    readonly t: Input<Messages>;
  }) {
    return [
      button(
        'ShowApplicationOverview',
        {
          type: 'button',
          class: viewTabs.tab,
          'aria-pressed': function* () {
            return String((yield* devtoolView()) === 'application');
          },
          *click() {
            chooseDevtoolView('application');
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
          'aria-pressed': function* () {
            return String((yield* devtoolView()) === 'visual');
          },
          *click() {
            chooseDevtoolView('visual');
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
          'aria-pressed': function* () {
            return String((yield* devtoolView()) === 'template');
          },
          *click() {
            chooseDevtoolView('template');
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
          'aria-pressed': function* () {
            return String((yield* devtoolView()) === 'review');
          },
          *click() {
            chooseDevtoolView('review');
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
          'aria-pressed': function* () {
            return String((yield* devtoolView()) === 'folder-layout');
          },
          *click() {
            chooseDevtoolView('folder-layout');
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
          'aria-pressed': function* () {
            return String((yield* devtoolView()) === 'bypasses');
          },
          *click() {
            chooseDevtoolView('bypasses');
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
    ];
  },
);
