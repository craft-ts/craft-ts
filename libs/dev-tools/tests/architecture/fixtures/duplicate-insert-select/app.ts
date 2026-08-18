import { craftService, insertSelect, state } from '../craft-runtime';

export const { Grid } = craftService(
  { name: 'Grid', providedIn: 'global' },
  function* () {
    const cells = yield* state(
      'cells',
      [],
      insertSelect('cell', () => ({})),
      insertSelect('cell', () => ({})),
    );
    return { cells };
  },
);
