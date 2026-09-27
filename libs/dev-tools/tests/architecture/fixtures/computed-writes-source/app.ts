import { craftComputed, craftService, source$ } from '../craft-runtime';

const reset$ = source$<void>('reset$');

export const { Counter } = craftService(
  { name: 'Counter', providedIn: 'global' },
  function* () {
    yield* craftComputed('label', function* () {
      reset$.emit();
      return 1;
    });
  },
);
