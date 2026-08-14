import { craftService } from '../craft-runtime';

export const { Left } = craftService(
  { name: 'Left', scope: 'global' },
  function* () {
    yield* Right();
    return {};
  },
);

export const { Right } = craftService(
  { name: 'Right', scope: 'global' },
  function* () {
    yield* Left();
    return {};
  },
);
