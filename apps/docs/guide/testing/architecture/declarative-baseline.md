# Declarative architecture baseline

`assertDeclarativeArchitecture` is the first architecture test to add to a
Craft app. It is not a style check and it does not test the DOM. It reads the
static Craft graph and verifies five relationships that are easy to lose during
a refactor:

```typescript
it('keeps the app declarative', () => {
  assertDeclarativeArchitecture(graph.graph);
});
```

The same test protects five different failure modes:

| Rule | If it is missing, this can happen |
| --- | --- |
| `assertCraftUnique` | two persisted resources restore from the same storage slot |
| `assertHttpEndpointUnique` | two services own `GET users` and evolve it differently |
| `assertCraftComputedPure` | reading a derived value writes state or starts work |
| `assertNoDependencyCycles` | service construction loops through `A → B → A` |
| `assertMutationHasReactOn` | a successful write leaves the visible list stale |

The following examples show the actual code shape that each rule rejects.

## 1. Two persisted resources share one identity

Two feature files can both look reasonable in isolation:

```typescript
// features/users/user-list.ts
insertStoragePersister(
  craftUnique({ storeName: 'shop', key: 'user' }),
);
```

```typescript
// features/users/user-detail.ts
insertStoragePersister(
  craftUnique({ storeName: 'shop', key: 'user' }),
);
```

They do not create a list cache and a detail cache. They create one storage
identity with two call sites. Restoring the detail can overwrite the value that
the list expects, and the bug only appears after a reload or cache restore.

`assertCraftUnique` fails with both file locations. The fix is to give the
resources distinct identities:

```typescript
craftUnique({ storeName: 'shop', key: 'user-list' });
craftUnique({ storeName: 'shop', key: 'user-detail' });
```

See [Unique identities](./unique-identities) and
[Persisted identities](./persisted-identities).

## 2. Two services call the same HTTP endpoint

This duplication is also invisible to TypeScript:

```typescript
// users-api.ts
const users = yield* CraftHttpClient.get(({ response }) => ({
  url: 'users',
  success: response<User[]>(),
}));
```

```typescript
// admin-api.ts
const users = yield* CraftHttpClient.get(({ response }) => ({
  url: 'users',
  success: response<AdminUser[]>(),
}));
```

Both are `GET users`. One feature can add pagination or change the response
shape while the other keeps the old assumption. The two call sites are now
competing owners of one transport contract.

`assertHttpEndpointUnique` forces one owner. The other service must depend on
that owner and derive its own view:

```typescript
const users = yield* UsersApi();
const admins = craftComputed('admins', function* () {
  return (yield* users.list()).filter((user) => user.role === 'admin');
});
```

See [HTTP endpoint ownership](./http-endpoint-ownership).

## 3. A computed value performs work while being read

The purpose of `craftComputed` is to derive a value:

```typescript
const remaining = craftComputed('remaining', function* () {
  return (yield* tasks()).filter((task) => !task.done).length;
});
```

This version changes the meaning of a read:

```typescript
const remaining = craftComputed('remaining', function* () {
  yield* audit.log('recomputed');
  yield* tasks.set(normalizeTasks(yield* tasks()));
  return (yield* tasks()).filter((task) => !task.done).length;
});
```

Now a template read can write state, call a method or trigger another graph
branch. Depending on recomputation order, this can produce a loop, duplicate
work or state that changes merely because it was displayed.

`assertCraftComputedPure` rejects both direct writes and calls through another
method binding. Put the work in a method, `on$`, `query` or `mutation`, and let
the computed only read.

See [Computed purity](./computed-purity).

## 4. Two services depend on each other

The graph for this pair is enough to fail the suite:

```text
UserList ──depends-on──▶ UserMutation
UserMutation ──depends-on──▶ UserList
```

In source, the cycle usually comes from two factories each yielding the other:

```typescript
// features/users/user-list.ts
function* userListFactory() {
  const mutation = yield* UserMutation();
  return { mutation };
}

// features/users/user-mutation.ts
function* userMutationFactory() {
  const list = yield* UserList();
  return { list };
}
```

The surrounding `craftService(...)` declarations are omitted here; the
important part is the two dependency edges created by the `yield*` calls.

The application may not fail until the route first constructs the services. Then
it can recurse forever or expose a partially constructed value.

`assertNoDependencyCycles` identifies the path. Break it by extracting a small
shared contract, passing an input, or moving a derived value into the consumer.
Two features depending on a common `Auth` service are not a cycle:

```text
UserList ──▶ Auth ◀── Checkout
```

See [Dependency cycles](./dependency-cycles).

## 5. A mutation succeeds but the list never refreshes

The orphan mutation is the most user-visible failure:

```typescript
const createTask = yield* mutation('createTask', {
  method: (input: NewTask) => input,
  loader: saveTask,
});

const tasks = yield* query('tasks', {
  params: () => filters(),
  loader: loadTasks,
});
```

The server has the new task, but the query has no declared relationship with the
mutation. The user clicks “Create”, gets a success response, and still sees the
old list until a hard reload.

Declare the relationship on the query:

```typescript
const tasks = yield* query(
  'tasks',
  {
    params: () => filters(),
    loader: loadTasks,
  },
  insertReactOnMutation(createTask, {
    reload: { onMutationSuccess: true },
  }),
);
```

The graph records a `triggers` edge from `createTask` to `tasks`. The exact
policy can be a reload, an optimistic patch or another supported insertion; the
important part is that it is declared where the query is defined.

See [Mutation reactions](./mutation-reactions).

## What the aggregate test does — and does not do

The aggregate test is now understandable as a compact CI gate:

```typescript
it('protects the baseline graph invariants', () => {
  assertDeclarativeArchitecture(graph.graph);
});
```

It does **not** cover every architecture policy. Add focused assertions for:

- route DI and error-screen proofs: [`assertRouteDiProofs`](./route-di-proofs);
- folder ownership: [`assertPathBoundaries`](./path-boundaries);
- Effect loader boundaries: [`assertPrimitiveLoaderRequirements`](./primitive-loader-requirements);
- interactive control names: [`assertInteractiveElementNamed`](./interactive-element-names);
- `craftEffect` network and imperative-sync constraints: [Effect rules](./craft-effect-network).

Keep the aggregate assertion for the common baseline, and keep focused rules for
policies whose failure message should explain a product or team boundary.

## Explicit exceptions

Some mutations really are fire-and-forget: logout, telemetry or an export with
no cached query. Name those exceptions instead of weakening the whole rule:

```typescript
assertDeclarativeArchitecture(graph.graph, {
  allow: ['logout', 'sendTelemetry'],
});
```

An `allow` entry is a documented decision. It should be narrow enough that a new
orphan mutation cannot hide inside it.

## See also

- [Architecture rules](/guide/testing/architecture)
- [Craft graph vs Nx](/guide/testing/craft-graph-vs-nx)
