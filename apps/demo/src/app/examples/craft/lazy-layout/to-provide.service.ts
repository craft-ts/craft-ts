import { craftService } from '@craft-ng/core';

export const { OtherService, provideOtherService } = craftService(
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
