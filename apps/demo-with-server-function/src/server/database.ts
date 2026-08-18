import { DatabaseSync } from 'node:sqlite';
import { Context, Data, Effect, Layer } from 'effect';

export type User = {
  readonly id: number;
  readonly name: string;
  readonly email: string;
};

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly reason: string;
}> {}

export class UserRepository extends Context.Service<
  UserRepository,
  {
    readonly list: (
      filter: string,
    ) => Effect.Effect<readonly User[], DatabaseError>;
  }
>()('demo/UserRepository') {}

type SqlUserRow = {
  id: number;
  name: string;
  email: string;
};

export type DemoDatabase = {
  readonly layer: Layer.Layer<UserRepository>;
  readonly close: () => void;
};

export function createDemoDatabase(): DemoDatabase {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    );
    INSERT INTO users (name, email) VALUES
      ('Ada Lovelace', 'ada@craft.dev'),
      ('Grace Hopper', 'grace@craft.dev'),
      ('Alan Turing', 'alan@craft.dev');
  `);

  const repository: UserRepository['Service'] = {
    list(filter: string): Effect.Effect<readonly User[], DatabaseError> {
      return Effect.try({
        try: () => {
          const statement = database.prepare(
            'SELECT id, name, email FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY id',
          );
          const needle = `%${filter}%`;
          return statement.all(needle, needle) as unknown as readonly SqlUserRow[];
        },
        catch: (cause) =>
          new DatabaseError({
            reason: cause instanceof Error ? cause.message : String(cause),
          }),
      });
    },
  };

  return {
    layer: Layer.succeed(UserRepository)(repository),
    close: () => database.close(),
  };
}
