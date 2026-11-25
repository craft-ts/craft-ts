# Mutations must have a read-side reaction

`assertMutationHasReactOn` requires every mutation to have an
`insertReactOnMutation` edge to a query, unless the mutation is explicitly
allowed:

<<< @/tests/snippets/guide/testing/architecture/mutation-reactions.spec.ts#example

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

### Waive one mutation in `architecture/waivers.ts`

`craft-architecture-check` and `architectureReport` do not take the `allow`
list: they read [`architecture/waivers.ts`](/guide/testing/architecture#waivers).
The `mutation-react-on` rule reports **one finding per mutation**, and each
finding names the waiver target of that mutation, `primitive:<owner>.<name>`:

```text
Mutation logout has no query reacting to it (src/session.ts:5). Add
insertReactOnMutation(logout, …) to the query this write makes stale. For a
fire-and-forget write (logout, telemetry, export), waive this mutation alone in
architecture/waivers.ts: { rule: 'mutation-react-on', target: 'primitive:Session.logout', reason }.
```

Before — a `'*'` waiver excuses every mutation of the application, including
the next one that forgets its `insertReactOnMutation`:

```typescript
// ❌ hides every future orphaned mutation
{
  rule: 'mutation-react-on',
  target: '*',
  reason: 'A logout has no read side to refresh.',
},
```

After — the waiver names the one legitimate fire-and-forget mutation; any other
mutation without a reaction still fails the check:

```typescript
// ✅ excuses Session.logout only
{
  rule: 'mutation-react-on',
  target: 'primitive:Session.logout',
  reason: 'A logout has no read side to refresh.',
},
```

The fix is a choice, not an autofix: either add `insertReactOnMutation(...)` to
the query the write makes stale, or, when nothing on screen reads what the
mutation writes, copy the target from the message into a reasoned waiver. A
targeted waiver becomes **stale**, and fails the check, once its mutation gains
a reaction or is removed.

A `'*'` waiver for `mutation-react-on` is still accepted, so existing waiver
files keep passing, but prefer one targeted waiver per fire-and-forget mutation.

## See also

- [Reacting to mutations](/guide/state/react-on-mutation)
- [Write server data](/learn/06-mutate-data)
