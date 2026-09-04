import { button, craftComponent, div, state } from '../craft-runtime';

export const Page = craftComponent(
  'Page',
  {},
  function* () {
    const counter = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    }));
    const myPrimitiveMethod = counter.increment;
    return { myPrimitiveMethod };
  },
  ({ myPrimitiveMethod }) =>
    div([
      button({ click: myPrimitiveMethod }),
      button({ click: myPrimitiveMethod }),
    ]),
);
