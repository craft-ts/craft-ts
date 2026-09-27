import { craftException, craftGen, craftService, query } from '@craft-ts/core';

type User = { name: string };
const noUser = (): User | undefined => undefined;

const { Auth } = craftService({ name: 'Auth', providedIn: 'global' }, function* () {
  yield* query('auth', {
    params: () => true,
    loader: function* () {
      return noUser();
    },
  });
});

export const authGuard = craftGen(function* () {
  const { auth } = yield* Auth();
  const userValue = yield* auth.value();

  if (!userValue) return craftException({ _tag: 'NOT_AUTHENTICATED' });
  // demo: a user named "disabled" is routed to the global error screen
  if (userValue.name === 'disabled')
    return craftException({ _tag: 'USER_DISABLED' });

  return userValue;
});
