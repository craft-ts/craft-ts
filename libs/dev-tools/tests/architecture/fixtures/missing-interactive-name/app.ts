import { button, craftComponent } from '../craft-runtime';

export const Counter = craftComponent('Counter', {}, function* () {
  return button({ click() {} }, '+');
});
