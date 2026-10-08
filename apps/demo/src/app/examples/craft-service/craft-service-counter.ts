import { button, craftComponent, div, p, heading } from '@craft-ts/component';
import { craftService, state, craftExpose } from '@craft-ts/core';
import { example } from '../shared/example.style';

const { Counter, provideCounter } = craftService(
  { name: 'Counter', providedIn: 'toProvide' },
  function* () {
    yield* state('counter', 0, ({ update, set }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
      reset: () => set(0),
    }));
  },
);

export const { CraftServiceCounterView, provideCraftServiceCounterView } =
  craftService(
    { name: 'craftServiceCounterView', providedIn: 'toProvide' },
    function* () {
      yield* craftExpose('counter', (yield* Counter()).counter);
    },
  );

const CraftServiceCounterComponent = craftComponent(
  'CraftServiceCounterComponent',
  {
    providers: [provideCraftServiceCounterView(), provideCounter()],
  },
  () =>
    div({ class: example.centered }, [
      heading(
        { class: example.title },
        'craftService Counter (toProvide scope)',
      ),
      p({ class: example.bigValue }, CraftServiceCounterView.counter),
      div({ class: example.row }, [
        button(
          'decrement',
          {
            class: example.button,
            type: 'button',
            click: CraftServiceCounterView.counter.decrement,
          },
          '-',
        ),
        button(
          'reset',
          {
            class: example.button,
            type: 'button',
            click: CraftServiceCounterView.counter.reset,
          },
          'Reset',
        ),
        button(
          'increment',
          {
            class: example.button,
            type: 'button',
            click: CraftServiceCounterView.counter.increment,
          },
          '+',
        ),
      ]),
    ]),
);

export default CraftServiceCounterComponent;
