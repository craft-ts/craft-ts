import { craftService } from '@craft-ng/core';

export const { OtherServiceToYield, provideOtherService } = craftService(
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
