import { craftComputed, craftService, source$ } from '../craft-runtime';

const reset$ = source$<void>('reset$');

export const { Counter } = craftService(
  { name: 'Counter', scope: 'global' },
  function* () {
    const label = craftComputed('label', function* () {
      reset$.emit();
      return 1;
    });
    return { label };
  },
);
