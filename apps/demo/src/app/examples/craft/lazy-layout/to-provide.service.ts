import { craftService } from '@craft-ts/core';

export const { OtherService, provideOtherService } = craftService(
  {
    name: 'OtherService',
    providedIn: 'toProvide',
  },
  () => {
    return {
      getValue: () => 'other service value',
    };
  },
);
