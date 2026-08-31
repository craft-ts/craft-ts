import { button, craftComponent, div } from '../craft-runtime';
import { Counter } from './counter';

export const FirstPage = craftComponent(
  'FirstPage',
  {},
  function* () {
    const { counter } = yield* Counter();
    return { counter };
  },
  ({ counter }) =>
    div([
      button({ click: counter.increment }),
      button({ click: counter.increment }),
    ]),
);
