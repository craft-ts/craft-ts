import { Context, Data, Effect, Layer } from 'effect';

export type DatabaseRow = {
  readonly id: number;
  readonly value: string;
};

export class DatabaseConnectionError extends Data.TaggedError(
  'DatabaseConnectionError',
)<{
  readonly reason: string;
}> {}

export type DatabaseShape = {
  readonly query: (
    statement: string,
  ) => Effect.Effect<readonly DatabaseRow[], DatabaseConnectionError>;
};

export class Database extends Context.Service<Database, DatabaseShape>()(
  'demo-effect/Database',
) {}

/**
 * Route-scoped in-memory adapter. The delay makes the pending boundary visible;
 * the typed failure demonstrates how a database connection error reaches the
 * template without throwing it from the component itself.
 */
export const InMemoryDatabaseLive = Layer.succeed(Database, {
  query: Effect.fnUntraced(function* (_statement: string) {
    yield* Effect.sleep('700 millis');
    return yield* new DatabaseConnectionError({
      reason: 'the in-memory database connection is unavailable',
    });
  }),
});
