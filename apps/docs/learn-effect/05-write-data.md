# 5. Write data with Effect

**Goal:** model writes and explicit processes as Effects while retaining Craft's
mutation lifecycle.

## `mutationEffect`

Use `method` for the synchronous argument-to-params mapping and `loader` for
the Effect program:

```typescript
  const saveTask = yield* mutationEffect('saveTask', {
  method: (input: { readonly title: string }) => input,
  loader: ({ params }) => saveTaskEffect(params),
});

yield* saveTask.mutate({ title: 'Ship the Effect guide' });
```

The mutation exposes loading, value and typed `exceptions().loader` just like a
native Craft mutation. Compose it with the list query using the normal Craft
insertion:

```typescript
const tasksQuery = yield* queryEffect(
  'tasks',
  {
    params: () => ({ done: false }),
    loader: ({ params }) => listTasksEffect(params),
  },
  insertReactOnMutation(saveTask, {
    reload: { onMutationSuccess: true },
  }),
);
```

Use an optimistic insertion when the result can be predicted locally:

```typescript
const tasksQuery = yield* queryEffect(
  'tasks',
  {
    params: () => ({ done: false }),
    loader: ({ params }) => listTasksEffect(params),
  },
  insertReactOnMutation(saveTask, {
    optimisticPatch: {
      title: ({ mutationParams }) => mutationParams.title,
    },
    reload: { onMutationException: true },
  }),
);
```

Effect remains responsible for the operation and its typed errors; Craft remains
responsible for when the resource is refreshed and what the UI renders.

## `asyncProcessEffect`

Use `asyncProcessEffect` for an explicit process that is not a read cache or a
write resource:

```typescript
const refresh = yield* asyncProcessEffect('refresh', {
  method: (userId: string) => userId,
  loader: ({ params }) => refreshProfile(params),
});

yield* refresh.method('user-ada');
```

This is useful for refresh actions, exports, background commands and similar
flows. Do not turn every Effect into an async process: choose `queryEffect` for
server state, `mutationEffect` for writes and `asyncProcessEffect` for explicit
commands.

## Validate arguments before the Effect

Effect Schema can be used anywhere Craft accepts a Standard Schema. Convert it
once:

```typescript
import { Schema } from 'effect';

const SaveTask = Schema.toStandardSchemaV1(
  Schema.Struct({ title: Schema.String }),
);

const saveTask = yield* mutationEffect('saveTask', {
  methodSchema: SaveTask,
  method: (input) => input,
  loader: ({ params }) => saveTaskEffect(params),
});
```

For a schema failure, Craft reports a parse exception. For a business rule such
as “this title already exists”, return a tagged Effect error from the Effect
program instead. See [Effect Schema](/guide/state/schema-validation#effect-schema)
for synchronous and asynchronous decoding rules.

## What you gained

Typed Effect writes with Craft's loading, cancellation, cache invalidation and
optimistic-update machinery. Next, provide the services that those programs
require at app and route scope.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 4. Load data with Effect](/learn-effect/04-load-data)

[6. Provide Layers and route the app →](/learn-effect/06-layers-routing)

</div>
