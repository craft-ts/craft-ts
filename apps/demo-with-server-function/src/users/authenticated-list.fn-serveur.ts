import { serverFunction } from '@craft-ts/core';
import { Effect, Schema } from 'effect';
import { UserRepository } from '../server/database';
import {
  authenticatedListHandshake,
  ClaimedUserIdRequirement,
  claimedUserId,
} from '../shared/claimed-user-id';
import { matchingUser } from './admin-access.mw-serveur';
import { auditedRequest } from './request-audit.mw-serveur';
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
 * middleware ; l'identité annoncée par le navigateur arrive par le canal
 * `clientContext`, déclaré par `requireClientDI(...)` et par les middleware.
 *
 * Le handler lit cette valeur avec
 * `required(ClaimedUserIdRequirement.token)` : elle vient du contexte client
 * **validé**, pas du DI serveur. Elle n'est utilisable ici que
 * parce que `demo.matching-user` l'a déjà confrontée à la session.
 */
export const getAuthenticatedUsers = serverFunction(
  authenticatedListHandshake,
  authenticatedListUsersInputSchema,
  { exposure: 'client', output: authenticatedListUsersOutputSchema },
)
  .pipe(claimedUserId)
  .use(matchingUser)
  .use(auditedRequest)
  .handler(({ input, context, required }) =>
    Effect.gen(function* () {
      // Intentional latency to make the frontend loading cycle visible.
      yield* Effect.sleep('600 millis');
      const users = yield* UserRepository;
      yield* Effect.log(
        `demo.users.authenticated-list actor=${context.authenticatedUser.id} claimed=${required(ClaimedUserIdRequirement.token)} locale=${context.requestLocale}`,
      );
      return yield* users.list(input.filter);
    }),
  );
