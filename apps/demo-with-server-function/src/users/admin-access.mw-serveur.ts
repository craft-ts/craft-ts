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
 * Le champ `userId` est déclaré ici : il est validé par le registre avec le
 * schéma de la server function, puis lisible typé par le handler.
 */
export const matchingUser = craftMiddleware('demo.matching-user')
  .use(adminOnly)
  .input(Schema.toStandardSchemaV1(Schema.Struct({ userId: Schema.String })))
  .server(({ input, context, next }) =>
    Effect.gen(function* () {
      if (input.userId !== context.authenticatedUser.id) {
        return yield* new AuthenticatedUserMismatch({
          message: `AuthenticatedUserMismatch: authenticated user "${context.authenticatedUser.id}" cannot access user "${input.userId}".`,
          requestedUserId: input.userId,
          authenticatedUserId: context.authenticatedUser.id,
        });
      }
      return yield* next({ context: {} });
    }),
  );
