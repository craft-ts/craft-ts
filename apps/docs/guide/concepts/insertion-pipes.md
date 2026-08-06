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

The typed pipe keeps the primitive call readable and gives every member the
correct contextual type. Members run from left to right, and each member can
read the outputs of the members before it through `insertions`.

## State

```typescript
import { computed } from '@angular/core';
import { insertStatePipe, state } from '@craft-ng/core';

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
        isOdd: computed(() => state() % 2 === 1),
        incrementAndReport: () => {
          insertions.increment();
          return state();
        },
      }),
    ),
  );
```

## Query

```typescript
import {
  insertLocalStoragePersister,
  insertQueryPipe,
  query,
} from '@craft-ng/core';

const { users } =
  yield *
  query(
    'users',
    {
      params: () => ({ page: 1 }),
      loader: ({ params }) => api.getUsers(params),
    },
    insertQueryPipe(
      insertLocalStoragePersister({ storeName: 'app', key: 'users' }),
      ({ resource }) => ({
        reloadUsers: () => resource.reload(),
      }),
    ),
  );
```

## Mutation

```typescript
import { insertMutationPipe, mutation } from '@craft-ng/core';

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
      reload: () => resource.reload(),
    }),
    ({ insertions }) => ({
      reloadTwice: () => {
        insertions.reload();
        insertions.reload();
      },
      }),
    ),
  );
```

## URL state

```typescript
import { computed } from '@angular/core';
import { insertQueryParamsPipe, queryParams } from '@craft-ng/core';

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
        hasSearch: computed(() => state().search.length > 0),
      }),
      ({ state, patch }) => ({
        nextPage: () => patch({ page: state().page + 1 }),
      }),
    ),
  );
```

## Async process

```typescript
import { insertAsyncProcessPipe, asyncProcess } from '@craft-ng/core';

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
    ({ state }) => ({ rowCount: computed(() => state().grid.length) }),
  ),
);
```

The typed pipes delegate to `craftPipe`, so their runtime semantics remain the
same: insertion outputs are merged left to right, generator insertions are
driven, and each member keeps its own observability wrapper.
