import { serverFunction } from '@craft-ts/core';
import { Data, Effect, Schema } from 'effect';
import { requireAdmin } from '../shared/authenticated-user';
import { UserRepository } from '../server/database';
import { UserSchema } from './user-schema';

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
).handler(({ input }) =>
  Effect.gen(function* () {
    const authenticatedUser = yield* requireAdmin;

    if (input.userId !== authenticatedUser.id) {
      return yield* new AuthenticatedUserMismatch({
        message: `AuthenticatedUserMismatch: authenticated user "${authenticatedUser.id}" cannot access user "${input.userId}".`,
        requestedUserId: input.userId,
        authenticatedUserId: authenticatedUser.id,
      });
    }

    // Intentional latency to make the frontend loading cycle visible.
    yield* Effect.sleep('600 millis');
    const users = yield* UserRepository;
    return yield* users.list(input.filter);
  }),
);
