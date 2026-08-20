# Mutations must have a read-side reaction

`assertMutationHasReactOn` requires every mutation to have an
`insertReactOnMutation` edge to a query, unless the mutation is explicitly
allowed:

```typescript
it('keeps reads fresh after writes', () => {
  assertMutationHasReactOn(graph.graph, {
    allow: ['logout'],
  });
});
```

## What it prevents

The stale-list bug is easy to write:

```typescript
const createTask = yield* mutation('createTask', {
  method: (input: NewTask) => input,
  loader: saveTask,
});

// The list query exists, but nothing says it reacts to createTask.
```

The write succeeds and the database contains the new task, while the list on
screen remains unchanged until a full reload. The graph sees that the mutation
has no `triggers` edge and fails CI.

## The declared relationship

Put the insertion on the query:

```typescript
const tasks = yield* query(
  'tasks',
  { params: filters, loader: loadTasks },
  insertReactOnMutation(createTask, {
    reload: { onMutationSuccess: true },
  }),
);
```

The same rule covers nested `insertQueryPipe` composition. It does not require
every mutation to reload every query — only that the write has an explicit
read-side policy somewhere.

## Legitimate fire-and-forget writes

Logout, telemetry and an export may intentionally have no query to refresh:

```typescript
assertMutationHasReactOn(graph.graph, {
  allow: ['logout', 'sendTelemetry', 'exportUsers'],
});
```

Keep the allowlist named and small so a newly orphaned mutation cannot hide in a
generic `allow: ['*']` convention.

## See also

- [Reacting to mutations](/guide/state/react-on-mutation)
- [Write server data](/learn/06-mutate-data)
