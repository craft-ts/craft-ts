import { serverFunction } from '@craft-ts/core';
import { Effect, Schema } from 'effect';
import { UserRepository, UserSchema } from '../server/database';

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
).handler(({ input }) =>
  Effect.gen(function* () {
    // Intentional latency to make the frontend loading cycle visible.
    yield* Effect.sleep('600 millis');
    const users = yield* UserRepository;
    return yield* users.list(input.filter);
  }),
);
