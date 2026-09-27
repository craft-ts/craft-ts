import { craftService, craftExpose } from '@craft-ts/core';

export const { OtherService, provideOtherService } = craftService(
  {
    name: 'OtherService',
    providedIn: 'toProvide',
  },
  function* () {
    yield* craftExpose('getValue', () => 'other service value');
  },
);
