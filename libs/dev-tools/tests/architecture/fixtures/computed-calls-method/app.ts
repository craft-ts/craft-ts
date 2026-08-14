import { craftComputed, craftMethod, craftService } from '../craft-runtime';

export const { Counter } = craftService(
  { name: 'Counter', scope: 'global' },
  function* () {
    const bump = craftMethod('bump', function* () {
      return 1;
    });
    const label = craftComputed('label', function* () {
      yield* bump();
      return 1;
    });
    return { bump, label };
  },
);
