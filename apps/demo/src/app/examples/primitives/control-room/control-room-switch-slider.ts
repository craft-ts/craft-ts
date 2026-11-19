import { button, craftComponent, div, ifNode, input, label, small, withComponentProviders, type Input } from '@craft-ts/component';
import { craftComputed, craftMethod, craftService, craftUse, state, type CraftServiceInput } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { eventValue } from '../../../event-value';
import { example } from '../../shared/example.style';
import { controlRoom } from './control-room.style';
import { ControlRoomView } from './control-room-view.service';

// -- Switch -----------------------------------------------------------------

export const { ControlRoomSwitchView, provideControlRoomSwitchView } =
  craftService(
    { name: 'controlRoomSwitchView', providedIn: 'toProvide' },
    function* () {
      const on = yield* state('on', false, ({ state: read, update }) => ({
        toggle: () => update((value) => !value),
        stateLabel: craftUse(craftComputed('stateLabel', function* () {
          return (yield* read()) ? 'on' : 'off';
        })),
        checked: craftUse(craftComputed('checked', function* () {
          return String(yield* read());
        })),
      }));
      yield* craftMethod('toggle', function* () {
        yield* on.toggle();
        yield* ControlRoomView.activity.switchToggled();
      });
    },
  );

export const Switch = craftComponent(
  'Switch',
  { providers: [provideControlRoomSwitchView()] },
  (inputs: { readonly name: Input<string> }) =>
    div({ class: controlRoom.widget }, [
      button(
        'switchToggle',
        {
          type: 'button',
          role: 'switch',
          class: buttonUi.root,
          'data-variant': 'secondary',
          'aria-checked': ControlRoomSwitchView.on.checked,
          click: ControlRoomSwitchView['toggle'],
        },
        [inputs.name, ': ', ControlRoomSwitchView.on.stateLabel],
      ),
    ]),
);

// -- Slider -----------------------------------------------------------------

// The slider keeps where it was moved to; until then it shows its input.
export const { ControlRoomSliderView, provideControlRoomSliderView } =
  craftService(
    { name: 'controlRoomSliderView', providedIn: 'toProvide' },
    function* (inputs: {
      readonly $provided: { readonly start: CraftServiceInput<number> };
    }) {
      const initialPosition = (): number | null => null;
      const position = yield* state(
        'position',
        initialPosition(),
        ({ set, state: read }) => ({
          moveTo: (next: number) => set(next),
          aboveLimit: craftUse(
            craftComputed('aboveLimit', function* () {
              return (
                (yield* read()) ?? (yield* inputs.$provided.start())
              ) >= 80;
            }),
          ),
        }),
      );
      yield* craftMethod('moveTo', function* (next: number) {
        yield* position.moveTo(next);
        yield* ControlRoomView.activity.sliderMoved();
      });
    },
  );

export const Slider = craftComponent(
  'Slider',
  {},
  (inputs: { readonly name: Input<string>; readonly start: Input<number> }) =>
    div({ class: controlRoom.widget }, [
      label({ class: example.label }, [
        inputs.name,
        ' · ',
        function* () {
          return String((yield* ControlRoomSliderView.position()) ?? (yield* inputs.start()));
        },
        input('sliderRange', {
          type: 'range',
          min: '0',
          max: '100',
          value: function* () {
            return String((yield* ControlRoomSliderView.position()) ?? (yield* inputs.start()));
          },
          input: function* (event) {
            yield* ControlRoomSliderView['moveTo'](Number(eventValue(event)));
          },
        }),
      ]),
      ifNode(
        ControlRoomSliderView.position.aboveLimit,
        () => small({ class: example.text, 'data-exampleText': 'error' }, 'Above the 80 limit'),
      ),
    ]),
).pipe(
  withComponentProviders(({ start }) => [
    provideControlRoomSliderView({ start }),
  ]),
);
