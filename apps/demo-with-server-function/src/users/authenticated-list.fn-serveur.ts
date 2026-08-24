import { serverFunction } from '@craft-ts/core';
import { Data, Effect, Schema } from 'effect';
import { UserRepository } from '../server/database';
import { authenticatedListHandshake } from '../shared/claimed-user-id';
import { matchingUser } from './admin-access.mw-serveur';
import { auditedRequest } from './request-audit.mw-serveur';
import { UserSchema } from './user-schema';

export { AuthenticatedUserMismatch } from './admin-access.mw-serveur';

export class AuthenticatedUsersNotFound extends Data.TaggedError(
  'AuthenticatedUsersNotFound',
)<{
  readonly status: 404;
  readonly message: string;
  readonly filter: string;
}> {}

const authenticatedListUsersInputSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ filter: Schema.String }),
);
const authenticatedListUsersOutputSchema = Schema.toStandardSchemaV1(
  Schema.Array(UserSchema),
);

/**
 * L'autorisation et la vérification d'identité vivent dans la chaîne de
 * middleware ; ce que le navigateur annonce arrive par le canal
 * `clientContext`, dont la forme est celle des handshakes que ces middleware
 * exigent.
 *
 * Le handler lit cette valeur dans `clientContext`, séparée de `context` : elle
 * n'est utilisable ici que parce que `demo.matching-user` l'a déjà confrontée à
 * la session serveur.
 */
export const getAuthenticatedUsers = serverFunction(
  authenticatedListHandshake,
  authenticatedListUsersInputSchema,
  { exposure: 'client', output: authenticatedListUsersOutputSchema },
)
  .use(matchingUser)
  .use(auditedRequest)
  .handler(({ input, context, clientContext }) =>
    Effect.gen(function* () {
      const authenticatedUser = yield* matchingUser;
      // Intentional latency to make the frontend loading cycle visible.
      yield* Effect.sleep('600 millis');
      const users = yield* UserRepository;
      yield* Effect.log(
        `demo.users.authenticated-list actor=${authenticatedUser.id} claimed=${clientContext.userId} locale=${context.requestLocale}`,
      );
      const result = yield* users.list(input.filter);
      if (result.length === 0) {
        return yield* new AuthenticatedUsersNotFound({
          status: 404,
          message: `No users matched the filter "${input.filter}".`,
          filter: input.filter,
        });
      }
      return result;
    }),
  );
