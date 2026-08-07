# 5. Load server data

**Goal:** replace the hand-rolled `load()` from step 4 with `query`, and get
loading, error and exception state for free.

## The query primitive

```typescript
import { CraftHttpClient, craftService, query } from '@craft-ng/core';

export const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* () {
    const tasksQuery = yield* query('tasksQuery', {
      // The initial params value immediately triggers the loader.
      params: () => ({ done: false }),
      loader: function* ({ params }) {
        return yield* CraftHttpClient.get(({ response }) => ({
          url: `/api/tasks?done=${params.done}`,
          success: response<Task[]>(),
        }));
      },
    });

    return tasksQuery;
  },
);
```

Three things to read here.

**`params`** is reactive. When what it returns changes, the loader re-runs. It
can be a signal, a function, or a generator that yields other services.

**`loader`** is a generator, so it can `yield*` — here `CraftHttpClient`, which
is the craft-tracked HTTP client. A plain `async` function works too when there
is nothing to yield.

**The result** is a ref carrying the full async state:

```typescript
tasksQuery.value(); // Task[] | undefined — never throws
tasksQuery.isLoading(); // boolean
tasksQuery.status(); // 'idle' | 'loading' | 'resolved' | 'exception'
tasksQuery.exception(); // craftException | undefined
```

::: tip
`value()` is safe to read in templates and computed signals: it returns
`undefined` when the query has no resolved value.
:::

## In the template

`ifBlock` / `matchBlock` are the structural conditionals (see [step
2](/learn/02-derive#control-flow-the-angular-equivalents)). For a first pass a
ternary chain reads fine — just remember it makes the branch invisible to the
[type-level assertions](/guide/testing/type-level):

```typescript
import { craftComponent, each, li, p, ul } from '@craft-ng/component';

export const Tasks = craftComponent(
  'Tasks',
  {},
  function* () {
    const tasks = yield* TaskList();
    return { tasks };
  },
  ({ tasks }) =>
    tasks.isLoading()
      ? p('Loading…')
      : tasks.hasException()
        ? p('Could not load tasks.')
        : ul(
            each(
              () => tasks.value() ?? [],
              { track: (task) => task.id },
              (task) => li(task.title),
            ),
          ),
);
```

When the branches depend on an exception **code** rather than a boolean, reach
for `matchBlock.exhaustive(...)` — the compiler then checks you covered every
code:

```typescript
matchBlock.exhaustive(() => tasks.exceptions().loader, 'code', {
  TASKS_FORBIDDEN: () => p('You do not have access to this list.'),
  TASKS_NOT_FOUND: () => p('This list no longer exists.'),
});
```

See [Exceptions as values](/guide/concepts/exceptions).

## Triggering it yourself

`params` re-runs the loader automatically. When the trigger is a user action
instead, use `method`:

```typescript
const { searchQuery } =
  yield *
  query('searchQuery', {
    method: (term: string) => term,
    loader: function* ({ params: term }) {
      return yield* CraftHttpClient.get(({ response }) => ({
        url: `/api/tasks?q=${term}`,
        success: response<Task[]>(),
      }));
    },
  });

yield * searchQuery.call('angular');
```

## Adding derived values

Same insertion mechanism as step 2 — third argument:

```typescript
const { tasksQuery } =
  yield *
  query(
    'tasksQuery',
    {
      /* … */
    },
    ({ value, isLoading }) => ({
      count: computed(() => value()?.length ?? 0),
      isEmpty: computed(() => !isLoading() && value()?.length === 0),
    }),
  );

tasksQuery.count();
```

## About the flicker

There isn't one: when `params` change, the previous value stays on screen until
the new one resolves. That is the **default**, so paginating never blanks the
list.

If you actually want the value cleared while loading, opt out explicitly:

```typescript
query('tasksQuery', {
  params: () => ({ page: page() }),
  preservePreviousValue: () => false,
  loader: /* … */,
});
```

## What you gained

Server state with the same shape as local state — named, insertable, tracked —
and no manual `isLoading` flag.

::: details Beyond the basics
Parallel queries per identifier, business exceptions raised from `params`, typed
HTTP exception matchers, and reacting to mutations are all on
[query](/guide/state/server-state).
:::

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 4. Compose services](/learn/04-compose)

[6. Write server data →](/learn/06-mutate-data)

</div>
