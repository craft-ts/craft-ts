import { craftService } from '@craft-ng/core';

export const { injectOtherService, provideOtherService } = craftService(
  {
    name: 'OtherService',
    scope: 'toProvide',
  },
  () => {
    return {
      getValue: () => 'other service value',
    };
  },
);
