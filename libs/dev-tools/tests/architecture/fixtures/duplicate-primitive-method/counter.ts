import { craftService, state } from '../craft-runtime';

export const { Counter } = craftService(
  { name: 'Counter', providedIn: 'global' },
  function* () {
    const counter = yield* state(
      'counter',
      0,
      ({ update }) => ({
        increment: () => update((value) => value + 1),
      }),
    );
    return { counter };
  },
);
