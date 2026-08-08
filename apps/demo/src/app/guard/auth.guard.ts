import { craftGen, craftException, craftService, query } from '@craft-ng/core';

type User = {
  name: string;
};

const { Auth } = craftService({ name: 'Auth', scope: 'global' }, function* () {
  return yield* query('auth', {
    params: () => true,
    loader: function* () {
      return undefined as User | undefined;
    },
  });
});

export const authGuard = craftGen(function* () {
  const user = yield* Auth();
  const userValue = user.value();

  if (!userValue) return craftException({ code: 'NOT_AUTHENTICATED' });
  // démo : un utilisateur nommé "disabled" est routé vers l'écran d'erreur global
  if (userValue.name === 'disabled')
    return craftException({ code: 'USER_DISABLED' });

  return userValue;
});
