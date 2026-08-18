import { craftException, craftGen, craftService, query } from '@craft-ts/core';

type User = {
  name: string;
};

const { Auth } = craftService({ name: 'Auth', providedIn: 'global' }, function* () {
  return yield* query('auth', {
    params: () => true,
    loader: function* () {
      return undefined as User | undefined;
    },
  });
});

export const authGuard = craftGen(function* () {
  const user = yield* Auth();
  const userValue = yield* user.value();

  if (!userValue) return craftException({ _tag: 'NOT_AUTHENTICATED' });
  // demo: a user named "disabled" is routed to the global error screen
  if (userValue.name === 'disabled')
    return craftException({ _tag: 'USER_DISABLED' });

  return userValue;
});
