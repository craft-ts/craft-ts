import { button, craftComponent, div } from '../craft-runtime';
import { Counter } from './counter';

export const Page = craftComponent('Page', {}, function* () {
  const { counter } = yield* Counter();
  return div([button({ click: counter.increment })]);
});
