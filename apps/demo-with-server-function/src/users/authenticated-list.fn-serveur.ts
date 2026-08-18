import { serverFunction } from '@craft-ts/core';
import { Effect, Schema } from 'effect';
import { UserRepository } from '../server/database';
import { matchingUser } from './admin-access.mw-serveur';
import { UserSchema } from './user-schema';

export { AuthenticatedUserMismatch } from './admin-access.mw-serveur';

const authenticatedListUsersInputSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ filter: Schema.String }),
);
const authenticatedListUsersOutputSchema = Schema.toStandardSchemaV1(
  Schema.Array(UserSchema),
);

/**
 * L'autorisation et la vérification d'identité vivent dans la chaîne de
 * middleware : le handler ne garde que son travail utile, et lit `userId` (venu
 * du schéma du middleware) comme n'importe quel champ de son propre input.
 */
export const getAuthenticatedUsers = serverFunction(
  'demo.users.authenticated-list',
  authenticatedListUsersInputSchema,
  { exposure: 'client', output: authenticatedListUsersOutputSchema },
)
  .use(matchingUser)
  .handler(({ input, context }) =>
    Effect.gen(function* () {
      // Intentional latency to make the frontend loading cycle visible.
      yield* Effect.sleep('600 millis');
      const users = yield* UserRepository;
      yield* Effect.log(
        `demo.users.authenticated-list actor=${context.authenticatedUser.id} requested=${input.userId}`,
      );
      return yield* users.list(input.filter);
    }),
  );
