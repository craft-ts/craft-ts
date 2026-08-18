import {
  requireServerPermission,
  serverFunction,
} from '@craft-ts/core';
import { Data, Effect, Schema } from 'effect';
import { CurrentUser } from '../server/authentication';
import { UserRepository, UserSchema } from '../server/database';

const authenticatedListUsersInputSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    filter: Schema.String,
    userId: Schema.String,
  }),
);
const authenticatedListUsersOutputSchema = Schema.toStandardSchemaV1(
  Schema.Array(UserSchema),
);

export class AuthenticatedUserMismatch extends Data.TaggedError(
  'AuthenticatedUserMismatch',
)<{
  readonly message: string;
  readonly requestedUserId: string;
  readonly authenticatedUserId: string;
}> {}

export const getAuthenticatedUsers = serverFunction(
  'demo.users.authenticated-list',
  authenticatedListUsersInputSchema,
  { exposure: 'client', output: authenticatedListUsersOutputSchema },
)
  .pipe(requireServerPermission('users:read'))
  .handler(({ input }) =>
    Effect.gen(function* () {
      const authenticatedUser = yield* CurrentUser;
      if (input.userId !== authenticatedUser.id) {
        return yield* Effect.fail(
          new AuthenticatedUserMismatch({
            message: `AuthenticatedUserMismatch: authenticated user "${authenticatedUser.id}" cannot access user "${input.userId}".`,
            requestedUserId: input.userId,
            authenticatedUserId: authenticatedUser.id,
          }),
        );
      }

      // Latence volontaire pour rendre visible le cycle loading du frontend.
      yield* Effect.sleep('600 millis');
      const users = yield* UserRepository;
      return yield* users.list(input.filter);
    }),
  );
