import { craftComponent, div } from '../craft-runtime';

export const SharedPageOne = craftComponent(
  'SharedPageOne',
  {},
  function* () {
    return {};
  },
  () => div([]),
);

export const SharedPageTwo = craftComponent(
  'SharedPageTwo',
  {},
  function* () {
    return {};
  },
  () => div([]),
);
