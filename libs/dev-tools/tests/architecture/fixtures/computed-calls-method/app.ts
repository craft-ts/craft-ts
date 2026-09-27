import { craftComputed, craftMethod, craftService } from '../craft-runtime';

export const { Counter } = craftService(
  { name: 'Counter', providedIn: 'global' },
  function* () {
    const bump = yield* craftMethod('bump', function* () {
      return 1;
    });
    yield* craftComputed('label', function* () {
      yield* bump();
      return 1;
    });
  },
);
