import { clientContext, craftMiddleware } from '@craft-ts/core';
import { Data, Effect } from 'effect';
import { requireAdminSession } from '../shared/authenticated-user';
import {
  claimedUserHandshake,
  ClaimedUserContext as ClaimedUser,
} from '../shared/claimed-user-id';

export class AuthenticatedUserMismatch extends Data.TaggedError(
  'AuthenticatedUserMismatch',
)<{
  readonly message: string;
  readonly requestedUserId: string;
  readonly authenticatedUserId: string;
}> {}

/**
 * Exige une session admin et publie l'utilisateur authentifié dans le contexte.
 * Le middleware produit directement la valeur métier yieldable.
 */
export const adminOnly = craftMiddleware('demo.admin-only').server(() =>
  Effect.gen(function* () {
    const authenticatedUser = yield* requireAdminSession;
    return { value: authenticatedUser, context: { authenticatedUser } };
  }),
);

/**
 * Vérifie que l'identité annoncée par le navigateur est celle de la session.
 *
 * `userId` n'est plus un champ d'input recopié à la main par le composant :
 * c'est le **contexte client**, déclaré ici par `clientContext(...)` dans le
 * `.pipe(...)`, validé
 * par le registre avant l'entrée dans la chaîne, et lu dans un champ distinct
 * de `context` — précisément pour qu'on ne puisse pas le confondre avec une
 * donnée de confiance. Ce middleware est ce qui le transforme en preuve.
 */
export const matchingUser = craftMiddleware('demo.matching-user')
  .pipe(adminOnly, clientContext(claimedUserHandshake))
  .server(() =>
    Effect.gen(function* () {
      const authenticatedUser = yield* adminOnly;
      const claimed = yield* ClaimedUser;
      if (claimed.userId !== authenticatedUser.id) {
        return yield* new AuthenticatedUserMismatch({
          message: `AuthenticatedUserMismatch: authenticated user "${authenticatedUser.id}" cannot access user "${claimed.userId}".`,
          requestedUserId: claimed.userId,
          authenticatedUserId: authenticatedUser.id,
        });
      }
      return { value: authenticatedUser };
    }),
  );
