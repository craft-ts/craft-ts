import { button, craftComponent } from '../craft-runtime';

export const Counter = craftComponent(
  'Counter',
  {},
  () => ({}),
  () => button({ click() {} }, '+'),
);
