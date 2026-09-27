import { craftService, insertSelect, state } from '../craft-runtime';

export const { Grid } = craftService(
  { name: 'Grid', providedIn: 'global' },
  function* () {
    yield* state(
      'cells',
      [],
      insertSelect('cell', () => ({})),
      insertSelect('cell', () => ({})),
    );
  },
);
