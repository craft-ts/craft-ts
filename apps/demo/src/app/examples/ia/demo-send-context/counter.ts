import {
  button,
  craftComponent,
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
  (_inputs: { readonly initialValue: Input<number> }) => [
    heading('Counter'),
    p(function* () {
      const { counter } = yield* SendContextCounterView();
      return `Value: ${yield* counter()}`;
    }),
    button(
      'increment',
      {
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
        type: 'button',
        click: function* () {
          yield* (yield* SendContextCounterView()).counter.decrement();
        },
      },
      'Decrement',
    ),
  ],
).pipe(
  withComponentProviders(({ initialValue }) => [
    provideSendContextCounterView({ initialValue }),
  ]),
);

export type SendContextCounterComponent = typeof SendContextCounterComponent;
