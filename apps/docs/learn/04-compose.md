# 4. Compose services

**Goal:** understand `yield*` — the one idea the whole library is built on.

This is the step that makes everything else obvious. Take your time here.

## The problem `yield*` solves

Classic Angular injection hides the dependency graph:

```typescript
class TaskList {
  private api = inject(TaskApi); // invisible from the outside
}
```

Nothing in `TaskList`'s type says it needs `TaskApi`. The compiler cannot tell
you when you forget to provide it, and a test cannot tell you what to mock.

Craft makes the same call **visible in the type**, by yielding it:

```typescript
export const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* () {
    const api = yield* TaskApi(); // ← tracked

    const tasks = yield* state('tasks', [] as Task[], /* … */);
    return tasks;
  },
);
```

Now `TaskList`'s type carries `TaskApi` as a dependency. Everything downstream —
the DI check on routes, the testing register, the dependency snapshot — reads
that type.

## Why a generator?

A generator is just a function that can hand control back to its caller at each
`yield`. Craft uses it as a **collection channel**: each `yield*` reports "I need
this" to the runtime driving the factory, which resolves it and folds it into the
graph.

You don't manage that channel yourself. In practice the whole rule is:

> Every named entity yields what it does not own. A factory, a computed, a
> method — each one records **its** dependencies with `yield*`.

```typescript
const api = yield* TaskApi(); // a service
const tasks = yield* state('tasks', []); // a primitive
```

::: warning A primitive is single-use
Each `state(...)` / `query(...)` call produces one generator, consumed exactly
once. Don't store one and `yield*` it twice.
:::

## Composing two services

```typescript
const { TaskApi } = craftService(
  { name: 'TaskApi', scope: 'global' },
  () => ({
    // raw fetch, only to keep this example about composition —
    // see the note below
    fetchAll: () => fetch('/api/tasks').then((r) => r.json()),
  }),
);

const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* () {
    const api = yield* TaskApi();
    const tasks = yield* state('tasks', [] as Task[], ({ set }) => ({
      // For this demo only; we'll later see why this belongs in a mutation instead.
      load: function* () {
        return yield* set(yield* api.fetchAll());
      },
    }));
    return tasks;
  },
);

const { TaskStats } = craftService(
  { name: 'TaskStats', scope: 'function' },
  function* () {
    const tasks = yield* TaskList();
    return {
      done: craftComputed('done', function* () {
        return (yield* tasks()).filter((t) => t.done).length;
      }),
    };
  },
);
```

Note the factory of `TaskApi` is a plain arrow — a service with no dependencies
doesn't need to be a generator.

`TaskStats` does not own `TaskList`. The computed yields `tasks` so **that**
read is recorded on `done`, not silently closed over from the factory.

::: warning Don't call `fetch` directly in real code
It is used here only to keep the example about composition. HTTP goes through
**`CraftHttpClient`**, which is yieldable — so the request is tracked like any
other dependency, it is mockable at the [browser
boundary](/guide/testing/browser-boundaries) in tests, and above all it is what
turns a failed response into a typed `craftException` you can handle.

A raw `fetch` gives you none of that: no tracking, no boundary, and a rejected
promise instead of a declared failure. [Step 5](/learn/05-load-data) uses
`CraftHttpClient` for real, and [step 6](/learn/06-mutate-data) shows the
exceptions it produces.

The `craft-ts/prefer-craft-http-client` ESLint rule flags direct `HttpClient`
usage for the same reason.
:::

## Taking only what you need

`TaskStats` only reads the array. Say so, and the graph records only that:

```typescript
const { TaskStats } = craftService(
  { name: 'TaskStats', scope: 'function' },
  function* () {
    const fetchAll = yield* TaskApi.fetchAll(); // one property
    // …
  },
);
```

A test for `TaskStats` then has to mock `fetchAll` and nothing else.

## What you gained

The mental model: **declare with a name, drive with `yield*`, derive the rest.**
Every remaining step is a variation on it — `query` yields, `mutation` yields,
guards yield, route providers yield.

::: tip Going deeper
`craftGen` lets you write a standalone generator outside a service — useful for
guards and route helpers. See [Generators](/guide/concepts/generators).
:::

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 3. Move logic out of the component](/learn/03-service)

[5. Load server data →](/learn/05-load-data)

</div>
