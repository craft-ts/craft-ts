import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

export type DemoDatabase = {
  readonly layer: Layer.Layer<UserRepository>;
  readonly close: () => void;
};

export function createDemoDatabase(): DemoDatabase {
  const databasePath = fileURLToPath(
    new URL('../../data/users.json', import.meta.url),
  );
  const rows = JSON.parse(readFileSync(databasePath, 'utf8')) as readonly User[];

  const repository: UserRepository['Service'] = {
    list(filter: string): Effect.Effect<readonly User[], DatabaseError> {
      return Effect.try({
        try: () =>
          rows.filter((user) =>
            `${user.name} ${user.email}`
              .toLocaleLowerCase()
              .includes(filter.toLocaleLowerCase()),
          ),
        catch: (cause) =>
          new DatabaseError({
            reason: cause instanceof Error ? cause.message : String(cause),
          }),
      });
    },
  };

  return {
    layer: Layer.succeed(UserRepository)(repository),
    close: () => undefined,
  };
}
