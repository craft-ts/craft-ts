import {
  abstract,
  craftService,
  pathParams,
  type PathParamsRefOf,
} from '@craft-ts/core';

export const userIdPathParam = pathParams('userId', {}, ({ value, set }) => ({
  nextUser: function* () {
    return yield* set(String(Number(value() || '0') + 1));
  },
  previousUser: function* () {
    return yield* set(String(Number(value() || '0') - 1));
  },
  shiftUser: function* (offset: number) {
    return yield* set(String(Number(value() || '0') + offset));
  },
}));

type UserIdPathParamsRef = PathParamsRefOf<typeof userIdPathParam>;

export const { UserIdPathParams, provideUserIdPathParams } = craftService(
  { name: 'UserIdPathParams', providedIn: 'abstract' },
  abstract<UserIdPathParamsRef>(),
);
