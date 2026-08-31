import { button, craftComponent, div } from '../craft-runtime';
import { Counter } from './counter';

export const SecondPage = craftComponent(
  'SecondPage',
  {},
  function* () {
    const { counter } = yield* Counter();
    return { counter };
  },
  ({ counter }) => div([button({ click: counter.increment })]),
);
