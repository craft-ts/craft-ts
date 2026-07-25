import { button, component, h2, p, type Input } from '@craft-ng/component';
import { provideHostName, state } from '@craft-ng/core';

export const SendContextCounterComponent = component(
  { providers: [provideHostName('component:SendContextCounterComponent')] },
  function* (initialValue: Input<number>) {
    const counter = yield* state(initialValue(), ({ update }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
    }));
    return { initialValue, counter };
  },
  ({ counter }) => [
    h2('Counter'),
    p(`Value: ${counter()}`),
    button({ click: counter.increment }, 'Increment'),
    button({ click: counter.decrement }, 'Decrement'),
  ],
);

export type SendContextCounterComponent = typeof SendContextCounterComponent;
