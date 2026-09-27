import {
  button,
  craftComponent,
  p,
  type Input,
  heading,
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
    function* (inputs: { readonly initialValue: CraftServiceInput<number> }) {
      const { initialValue } = inputs;

      yield* state(
        'counter',
        yield* initialValue(),
        ({ update }) => ({
          increment: () => update((value) => value + 1),
          decrement: () => update((value) => value - 1),
        }),
      );
      yield* craftExpose('initialValue', initialValue);
    },
  );

export const SendContextCounterComponent = craftComponent(
  'SendContextCounterComponent',
  { providers: [provideSendContextCounterView()] },
  function* (inputs: { readonly initialValue: Input<number> }) {
    const { counter } = yield* SendContextCounterView(inputs);
    return [
      heading('Counter'),
      p(function* () {
        return `Value: ${yield* counter()}`;
      }),
      button(
        'increment',
        { type: 'button', click: counter.increment },
        'Increment',
      ),
      button(
        'decrement',
        { type: 'button', click: counter.decrement },
        'Decrement',
      ),
    ];
  },
);

export type SendContextCounterComponent = typeof SendContextCounterComponent;
