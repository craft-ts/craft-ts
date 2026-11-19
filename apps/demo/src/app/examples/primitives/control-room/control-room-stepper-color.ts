import { button, craftComponent, div, small, span, strong, type Input } from '@craft-ts/component';
import { craftComputed, craftMethod, craftService, craftUse, state } from '@craft-ts/core';
import { assign } from '@craft-ts/style';
import { buttonUi } from '@craft-ts/ui/style';
import { example } from '../../shared/example.style';
import { pixel, pixelColor, pixelVars } from '../pixel-art/pixel.style';
import { controlRoom } from './control-room.style';
import { ControlRoomView } from './control-room-view.service';

// -- Stepper ----------------------------------------------------------------

const STEP_COUNT = 4;

export const { ControlRoomStepperView, provideControlRoomStepperView } =
  craftService(
    { name: 'controlRoomStepperView', providedIn: 'toProvide' },
    function* () {
      const step = yield* state('step', 1, ({ state: read, update }) => ({
        advance: () => update((current) => Math.min(STEP_COUNT, current + 1)),
        goBack: () => update((current) => Math.max(1, current - 1)),
        atStart: craftUse(craftComputed('atStart', function* () {
          return (yield* read()) === 1;
        })),
        atEnd: craftUse(craftComputed('atEnd', function* () {
          return (yield* read()) === STEP_COUNT;
        })),
        progress: craftUse(craftComputed('progress', function* () {
          return `Step ${yield* read()} of ${STEP_COUNT}`;
        })),
      }));
      yield* craftMethod('goBack', function* () {
        yield* step.goBack();
        yield* ControlRoomView.activity.stepperMovedBack();
      });
      yield* craftMethod('advance', function* () {
        yield* step.advance();
        yield* ControlRoomView.activity.stepperAdvanced();
      });
    },
  );

export const Stepper = craftComponent(
  'Stepper',
  { providers: [provideControlRoomStepperView()] },
  (inputs: { readonly name: Input<string> }) =>
    div({ class: controlRoom.widget }, [
      span({ class: example.hint }, inputs.name),
      strong(ControlRoomStepperView.step.progress),
      div({ class: controlRoom.actions }, [
        button(
          'stepperPrevious',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            disabled: ControlRoomStepperView.step.atStart,
            click: ControlRoomStepperView['goBack'],
          },
          'Back',
        ),
        button(
          'stepperNext',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'primary',
            disabled: ControlRoomStepperView.step.atEnd,
            click: ControlRoomStepperView['advance'],
          },
          'Next',
        ),
      ]),
    ]),
);

// -- Colour chooser ---------------------------------------------------------

const COLORS: readonly string[] = ['#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#eab308'];
const COLOR_SWATCHES = COLORS.map((color) => ({
  color,
  fill: pixelColor(color),
}));

export const {
  ControlRoomColorChooserView,
  provideControlRoomColorChooserView,
} = craftService(
  { name: 'controlRoomColorChooserView', providedIn: 'toProvide' },
  function* () {
    const initialColor = (): string => COLORS[0];
    const chosen = yield* state('chosen', initialColor(), ({ state: read, set }) => ({
      choose: (color: string) => set(color),
      label: craftUse(craftComputed('label', function* () {
        return `Signal colour ${yield* read()}`;
      })),
    }));
    yield* craftMethod('chooseColor', function* (color: string) {
      yield* chosen.choose(color);
      yield* ControlRoomView.activity.colorChosen();
    });
  },
);

export const ColorChooser = craftComponent(
  'ColorChooser',
  { providers: [provideControlRoomColorChooserView()] },
  () =>
    div({ class: controlRoom.widget }, [
      div(
        { class: pixel.palette },
        COLOR_SWATCHES.map((swatch) =>
          button('colorChooserSwatch', {
            type: 'button',
            class: pixel.swatch,
            style: assign(pixelVars.fill, swatch.fill),
            'aria-label': `Choose ${swatch.color}`,
            click: function* () {
              yield* ControlRoomColorChooserView['chooseColor'](swatch.color);
            },
          }),
        ),
      ),
      small({ class: example.hint }, ControlRoomColorChooserView.chosen.label),
    ]),
);
