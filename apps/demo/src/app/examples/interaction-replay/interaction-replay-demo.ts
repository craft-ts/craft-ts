import {
  button,
  craftComponent,
  div,
  ifNode,
  input,
  label,
  option,
  p,
  section,
  select,
  span,
  strong,
  heading,
} from '@craft-ts/component';
import { craftExpose, craftService, state } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import {
  interactionReplayDemo as demo,
} from './interaction-replay-demo.style';

export const { provideInteractionReplayDemoView, InteractionReplayDemoView } =
  craftService(
    { name: 'interactionReplayDemoView', providedIn: 'toProvide' },
    function* () {
      const expanded = yield* state('expanded', false, ({ update }) => ({
        toggle: () => update((value) => !value),
      }));
      const animationRunning = yield* state(
        'animationRunning',
        false,
        ({ update }) => ({
          toggle: () => update((value) => !value),
        }),
      );
      yield* craftExpose('expanded', expanded);
      yield* craftExpose('animationRunning', animationRunning);
    },
  );

export const InteractionReplayDemo = craftComponent(
  'InteractionReplayDemo',
  { providers: [provideInteractionReplayDemoView()] },
  () =>
    section({ class: demo.page }, [
      heading('Interaction state replay'),
      div({ class: demo.intro }, [
        p(
          'Record a debug session on this page, then replay it to compare transient browser states with persistent DOM states.',
        ),
        p(
          'Use Tab and Shift+Tab for focus-visible, hold a pointer on a button for active, and toggle each native control before recording.',
        ),
      ]),

      section({ class: demo.section }, [
        heading({ class: demo.sectionTitle }, 'Hover, focus and active'),
        p(
          { class: demo.text },
          'These controls use Craft interaction axes. Replay paints their state without re-dispatching pointer or keyboard events.',
        ),
        div({ class: demo.focusGroup }, [
          button(
            'replayInteractionButton',
            {
              type: 'button',
              class: [demo.control, buttonUi.root],
              'data-variant': 'secondary',
              'data-testid': 'interaction-state-button',
            },
            'Hover, focus, or hold me',
          ),
          input('focusVisibleInput', {
            type: 'text',
            class: demo.control,
            placeholder: 'Tab here to see :focus-visible',
            'aria-label': 'Focus-visible replay field',
            'data-testid': 'focus-visible-input',
          }),
        ]),
      ]),

      section({ class: demo.section }, [
        heading({ class: demo.sectionTitle }, 'Checked and disabled'),
        p(
          { class: demo.text },
          'Checked is represented by the native input property; disabled is represented by the disabled attribute. Both should remain visible in a replay snapshot.',
        ),
        label({ class: demo.checkCard }, [
          input('checkedState', {
            type: 'checkbox',
            checked: false,
            'data-testid': 'checked-state-checkbox',
          }),
          span('Toggle me to show the checked state'),
        ]),
        button(
          'disabledState',
          {
            type: 'button',
            class: [demo.control, buttonUi.root],
            disabled: true,
            'data-testid': 'disabled-state-button',
          },
          'Disabled control',
        ),
      ]),

      section({ class: demo.section }, [
        heading({ class: demo.sectionTitle }, 'Expanded and selected'),
        p(
          { class: demo.text },
          'Expanded is driven by aria-expanded and a Craft state axis. Selected is the browser’s current selected option.',
        ),
        div(
          {
            class: [demo.details, demo.detailsOpen],
            'data-replayExpanded': function* () {
              return (yield* InteractionReplayDemoView.expanded())
                ? ('open' as const)
                : ('closed' as const);
            },
          },
          [
            button(
              'expandedToggle',
              {
                type: 'button',
                class: [demo.control, buttonUi.root],
                'aria-expanded': InteractionReplayDemoView.expanded,
                'aria-controls': 'expanded-content',
                click: InteractionReplayDemoView.expanded.toggle,
                'data-testid': 'expanded-toggle',
              },
              function* () {
                return (yield* InteractionReplayDemoView.expanded())
                  ? 'Close the expanded content'
                  : 'Open the expanded content';
              },
            ),
            ifNode(InteractionReplayDemoView.expanded, () =>
              p(
                { id: 'expanded-content', class: demo.text },
                'This content follows the recorded expanded state.',
              ),
            ),
          ],
        ),
        label({ class: demo.row }, [
          strong('Selected option'),
          select(
            'selectedState',
            {
              class: demo.select,
              'aria-label': 'Select an option',
              'data-testid': 'selected-state-select',
            },
            [
              option({ value: 'alpha' }, 'Alpha'),
              option(
                { value: 'beta', selected: true },
                'Beta (initially selected)',
              ),
              option({ value: 'gamma' }, 'Gamma'),
            ],
          ),
        ]),
      ]),

      section({ class: demo.section }, [
        heading({ class: demo.sectionTitle }, 'Transitions and animations'),
        p(
          { class: demo.text },
          'The button above transitions its colors on hover and focus. Toggle this keyframe animation to check how replay timing and reduced-motion settings look.',
        ),
        div({ class: demo.row }, [
          button(
            'animationToggle',
            {
              type: 'button',
              class: [demo.control, buttonUi.root],
              'aria-pressed': InteractionReplayDemoView.animationRunning,
              'data-testid': 'animation-toggle',
              click: InteractionReplayDemoView.animationRunning.toggle,
            },
            function* () {
              return (yield* InteractionReplayDemoView.animationRunning())
                ? 'Stop animation'
                : 'Start animation';
            },
          ),
          div(
            {
              class: demo.animationBox,
              'data-replayAnimation': function* () {
                return (yield* InteractionReplayDemoView.animationRunning())
                  ? ('running' as const)
                  : ('idle' as const);
              },
              'data-testid': 'animation-box',
            },
            'Keyframe pulse',
          ),
        ]),
      ]),
    ]),
);
