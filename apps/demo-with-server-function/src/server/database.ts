import { fileURLToPath } from 'node:url';
import { Context, Effect, FileSystem, Layer, Schema } from 'effect';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';

export const UserSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String,
});

export type User = Schema.Schema.Type<typeof UserSchema>;

export class UserRepository extends Context.Service<
  UserRepository,
  {
    readonly list: (filter: string) => Effect.Effect<readonly User[]>;
  }
>()('demo/UserRepository') {}

export function createDemoDatabase() {
  const databasePath = fileURLToPath(
    new URL('../../data/users.json', import.meta.url),
  );

  const repository = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const rows = yield* fs.readFileString(databasePath).pipe(
      Effect.flatMap((content) => Effect.try(() => JSON.parse(content))),
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(UserSchema))),
    );

    return {
      list: (filter: string) =>
        Effect.sync(() =>
          rows.filter((user) =>
            `${user.name} ${user.email}`
              .toLocaleLowerCase()
              .includes(filter.toLocaleLowerCase()),
          ),
        ),
    } satisfies UserRepository['Service'];
  });

  return {
    layer: Layer.effect(UserRepository)(repository).pipe(
      Layer.provide(NodeFileSystem.layer),
    ),
    close: () => undefined,
  };
}
