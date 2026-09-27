import {
  button,
  craftComponent,
  div,
  p,
  heading,
} from '@craft-ts/component';
import { craftService, state } from '@craft-ts/core';
import { example } from '../shared/example.style';

const { Counter, provideCounter } = craftService(
  { name: 'Counter', providedIn: 'toProvide' },
  function* () {
    const counter = yield* state('counter', 0, ({ update, set }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
      reset: () => set(0),
    }));
    return counter;
  },
);

export const { CraftServiceCounterView, provideCraftServiceCounterView } =
  craftService(
    { name: 'craftServiceCounterView', providedIn: 'toProvide' },
    function* () {
      return { counter: yield* Counter() };
    },
  );

const CraftServiceCounterComponent = craftComponent(
  'CraftServiceCounterComponent',
  {
    providers: [provideCraftServiceCounterView(), provideCounter()],
  },
  function* () {
    const { counter } = yield* CraftServiceCounterView();
    return div({ class: example.centered }, [
      heading({ class: example.title }, 'craftService Counter (toProvide scope)'),
      p({ class: example.bigValue }, counter),
      div({ class: example.row }, [
        button('decrement', { class: example.button, type: 'button', click: counter.decrement }, '-'),
        button('reset', { class: example.button, type: 'button', click: counter.reset }, 'Reset'),
        button('increment', { class: example.button, type: 'button', click: counter.increment }, '+'),
      ]),
    ]);
  },
);

export default CraftServiceCounterComponent;
