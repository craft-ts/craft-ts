import {
  button,
  component,
  h2,
  p,
  type Input,
} from '@craft-ng/component';
import {
  craftUse,
  provideHostName,
  state,
  type GetDeps,
} from '@craft-ng/core';

export const SendContextCounterComponent = component(
  { providers: [provideHostName('component:SendContextCounterComponent')] },
  (initialValue: Input<number>) => {
    const counter = craftUse(
      state(initialValue(), ({ update }) => ({
        increment: () => update((value) => value + 1),
        decrement: () => update((value) => value - 1),
      })),
    );
    return { initialValue, counter };
  },
  ({ counter }) => [
    h2('Counter'),
    p(`Value: ${counter()}`),
    button({ click: counter.increment }, 'Increment'),
    button({ click: counter.decrement }, 'Decrement'),
  ],
);

export type SendContextCounterComponent =
  typeof SendContextCounterComponent;
export type GenDeps_SendContextCounterComponent = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
}>;
