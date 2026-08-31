import { serverFunction } from '@craft-ts/core';
import { Data, Effect, Schema } from 'effect';
import { UserRepository, UserSchema } from '../server/database';

export class UsersNotFound extends Data.TaggedError('UsersNotFound')<{
  readonly message: string;
  readonly filter: string;
}> {}

const listUsersInputSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    filter: Schema.String,
  }),
);
const listUsersOutputSchema = Schema.toStandardSchemaV1(
  Schema.Array(UserSchema),
);

/** Simple client-exposed server function: no client DI is required. */
export const listUsers = serverFunction(
  'demo.users.list',
  listUsersInputSchema,
  { exposure: 'client', output: listUsersOutputSchema },
)
  .handler(({ input }) =>
    Effect.gen(function* () {
      // Intentional latency to make the frontend loading cycle visible.
      yield* Effect.sleep('600 millis');
      const users = yield* UserRepository;
      const result = yield* users.list(input.filter);
      if (result.length === 0) {
        return yield* new UsersNotFound({
          message: `No users matched the filter "${input.filter}".`,
          filter: input.filter,
        });
      }
      return result;
    }),
  )
  .exposeErrors({
    UsersNotFound: (errorPayload) => ({
      code: 'USERS_NOT_FOUND',
      status: 404,
      payload: {
        message: errorPayload.message,
        filter: errorPayload.filter,
      },
    }),
  });
