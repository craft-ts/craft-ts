import { craftService } from '../craft-runtime';

export const { Left } = craftService(
  { name: 'Left', providedIn: 'global' },
  function* () {
    yield* Right();
  },
);

export const { Right } = craftService(
  { name: 'Right', providedIn: 'global' },
  function* () {
    yield* Left();
  },
);
