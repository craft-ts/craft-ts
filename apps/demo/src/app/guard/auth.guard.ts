import { craftGen, craftException, craftService, query } from '@craft-ng/core';

type User = {
  name: string;
};

const { AuthToYield } = craftService(
  { name: 'Auth', scope: 'global' },
  function* () {
    return yield* query({
      params: () => true,
      loader: async () => ({}) as User,
    });
  },
);

export const authGuard = craftGen(function* () {
  const user = yield* AuthToYield();
  const userSafeValue = user.safeValue();

  if (!userSafeValue) return craftException({ code: 'NOT_AUTHENTICATED' });
  // démo : un utilisateur nommé "disabled" est routé vers l'écran d'erreur global
  if (userSafeValue.name === 'disabled')
    return craftException({ code: 'USER_DISABLED' });

  return userSafeValue;
});
