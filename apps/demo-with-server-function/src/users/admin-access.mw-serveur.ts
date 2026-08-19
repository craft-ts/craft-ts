import { craftMiddleware } from '@craft-ts/core';
import { Data, Effect, Schema } from 'effect';
import { requireAdmin } from '../shared/authenticated-user';

export class AuthenticatedUserMismatch extends Data.TaggedError(
  'AuthenticatedUserMismatch',
)<{
  readonly message: string;
  readonly requestedUserId: string;
  readonly authenticatedUserId: string;
}> {}

/** Exige une session admin et publie l'utilisateur authentifié dans le contexte. */
export const adminOnly = craftMiddleware('demo.admin-only').server(({ next }) =>
  Effect.gen(function* () {
    const authenticatedUser = yield* requireAdmin;
    return yield* next({ context: { authenticatedUser } });
  }),
);

/**
 * Vérifie que l'identité annoncée par le navigateur est celle de la session.
 *
 * `userId` n'est plus un champ d'input recopié à la main par le composant :
 * c'est le **contexte client**, déclaré ici par `.clientContext(...)`, validé
 * par le registre avant l'entrée dans la chaîne, et lu dans un champ distinct
 * de `context` — précisément pour qu'on ne puisse pas le confondre avec une
 * donnée de confiance. Ce middleware est ce qui le transforme en preuve.
 */
export const matchingUser = craftMiddleware('demo.matching-user')
  .use(adminOnly)
  .clientContext(
    Schema.toStandardSchemaV1(Schema.Struct({ userId: Schema.String })),
  )
  .server(({ clientContext, context, next }) =>
    Effect.gen(function* () {
      if (clientContext.userId !== context.authenticatedUser.id) {
        return yield* new AuthenticatedUserMismatch({
          message: `AuthenticatedUserMismatch: authenticated user "${context.authenticatedUser.id}" cannot access user "${clientContext.userId}".`,
          requestedUserId: clientContext.userId,
          authenticatedUserId: context.authenticatedUser.id,
        });
      }
      return yield* next({ context: {} });
    }),
  );
