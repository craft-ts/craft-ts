import {
  button,
  craftComponent,
  div,
  p,
  type Input,
  heading,
  withComponentProviders,
} from '@craft-ts/component';
import {
  craftExpose,
  craftService,
  state,
  type CraftServiceInput,
} from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { sendContext } from './demo-send-context.style';

export const { SendContextCounterView, provideSendContextCounterView } =
  craftService(
    { name: 'sendContextCounterView', providedIn: 'toProvide' },
    function* (inputs: {
      readonly $provided: { readonly initialValue: CraftServiceInput<number> };
    }) {
      const { initialValue } = inputs.$provided;

      yield* state('counter', yield* initialValue(), ({ update }) => ({
        increment: () => update((value) => value + 1),
        decrement: () => update((value) => value - 1),
      }));
      yield* craftExpose('initialValue', initialValue);
    },
  );

export const SendContextCounterComponent = craftComponent(
  'SendContextCounterComponent',
  {},
  (_inputs: { readonly initialValue: Input<number> }) =>
    div({ class: sendContext.card }, [
      heading('Counter'),
      p({ class: sendContext.value }, function* () {
        const { counter } = yield* SendContextCounterView();
        return `Value: ${yield* counter()}`;
      }),
      div({ class: sendContext.buttons }, [
        button(
          'increment',
          {
            class: buttonUi.root,
            'data-variant': 'secondary',
            type: 'button',
            click: function* () {
              yield* (yield* SendContextCounterView()).counter.increment();
            },
          },
          'Increment',
        ),
        button(
          'decrement',
          {
            class: buttonUi.root,
            'data-variant': 'secondary',
            type: 'button',
            click: function* () {
              yield* (yield* SendContextCounterView()).counter.decrement();
            },
          },
          'Decrement',
        ),
      ]),
    ]),
).pipe(
  withComponentProviders(({ initialValue }) => [
    provideSendContextCounterView({ initialValue }),
  ]),
);

export type SendContextCounterComponent = typeof SendContextCounterComponent;
