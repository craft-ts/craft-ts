# Typed insertion pipes

Each primitive accepts one insertion directly. When a primitive needs several
insertions, use the pipe named after that primitive:

| Primitive      | Typed pipe               |
| -------------- | ------------------------ |
| `state`        | `insertStatePipe`        |
| `query`        | `insertQueryPipe`        |
| `mutation`     | `insertMutationPipe`     |
| `queryParams`  | `insertQueryParamsPipe`  |
| `asyncProcess` | `insertAsyncProcessPipe` |
| `craftStateMachine` | `insertStateMachinePipe` |

The typed pipe keeps the primitive call readable and gives every member the
correct contextual type. Members run from left to right, and each member can
read the outputs of the members before it through `insertions`.

## State

```typescript
import { craftComputed, insertStatePipe, state } from '@craft-ts/core';

const { counter } =
  yield *
  state(
    'counter',
    0,
    insertStatePipe(
      ({ update }) => ({
        increment: () => update((value) => value + 1),
      }),
      ({ state, insertions }) => ({
        isOdd: craftComputed(function* () {
          return (yield* state()) % 2 === 1;
        }),
        incrementAndReport: function* () {
          yield* insertions.increment();
          return yield* state();
        },
      }),
    ),
  );
```

## Query

```typescript
import {
  insertStoragePersister,
  insertQueryPipe,
  query,
} from '@craft-ts/core';

const { users } =
  yield *
  query(
    'users',
    {
      params: () => ({ page: 1 }),
      loader: ({ params }) => api.getUsers(params),
    },
    insertQueryPipe(
      insertStoragePersister(craftUnique({
        storeName: 'app',
        key: 'users',
      })),
      ({ resource }) => ({
        reloadUsers: function* () {
          return yield* resource.reload();
        },
      }),
    ),
  );
```

## Mutation

```typescript
import { insertMutationPipe, mutation } from '@craft-ts/core';

const { saveUser } =
  yield *
  mutation(
    'saveUser',
    {
      method: (user: User) => user,
      loader: ({ params }) => api.saveUser(params),
    },
  insertMutationPipe(
    ({ resource }) => ({
      reload: function* () {
        return yield* resource.reload();
      },
    }),
    ({ insertions }) => ({
      reloadTwice: function* () {
        yield* insertions.reload();
        yield* insertions.reload();
      },
      }),
    ),
  );
```

## URL state

```typescript
import { craftComputed, insertQueryParamsPipe, queryParams } from '@craft-ts/core';

const { filters } =
  yield *
  queryParams(
    'filters',
    {
      state: {
        page: { fallbackValue: 1 },
        search: { fallbackValue: '' },
      },
    },
    insertQueryParamsPipe(
      ({ state }) => ({
        hasSearch: craftComputed(function* () {
          return (yield* state()).search.length > 0;
        }),
      }),
      ({ state, patch }) => ({
        nextPage: function* () {
          const current = yield* state();
          return yield* patch({ page: current.page + 1 });
        },
      }),
    ),
  );
```

## Async process

```typescript
import { insertAsyncProcessPipe, asyncProcess } from '@craft-ts/core';

const { search } =
  yield *
  asyncProcess(
    'search',
    {
      method: (term: string) => term,
      loader: ({ params }) => api.search(params),
    },
  insertAsyncProcessPipe(
    () => ({ source: 'search-box' as const }),
    ({ insertions }) => ({
      prefixTerm: (term: string) => `${insertions.source}:${term}`,
    }),
    ),
  );
```

## When to use `craftPipe`

Use a single insertion directly when there is no composition:

```typescript
state('counter', 0, ({ update }) => ({
  increment: () => update((value) => value + 1),
}));
```

Keep [`craftPipe`](/guide/concepts/insertions) for universal compositions that
need an explicit context, especially nested insertions such as `insertSelect`:

```typescript
state('board', initialBoard, (context) =>
  craftPipe(
    context,
    insertSelect('grid', (gridContext) =>
      craftPipe(gridContext, ({ update }) => ({
        reset: () => update(() => []),
      })),
    ),
    ({ state }) => ({
      rowCount: craftComputed(function* () {
        return (yield* state()).grid.length;
      }),
    }),
  ),
);
```

The typed pipes delegate to `craftPipe`, so their runtime semantics remain the
same: insertion outputs are merged left to right, generator insertions are
driven, and each member keeps its own observability wrapper.
