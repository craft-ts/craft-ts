# Keep `craftEffect` out of imperative synchronisation

`assertCraftEffectNoImperativeSync` prevents a `craftEffect` from writing a
state/source or triggering another query, mutation or async process:

```typescript
it('keeps resource transitions declarative', () => {
  assertCraftEffectNoImperativeSync(graph.graph);
});
```

## The syntax is valid — the placement is not

The following calls are valid Craft generator syntax. `set`, `call` and
`mutate` return yieldable operations, so a generator consumes them with
`yield*`:

```typescript
function* submit() {
  yield* searchResults.set(yield* rawResults());
  yield* usersQuery.call(yield* searchTerm());
  yield* saveMutation.mutate(yield* draft());
}
```

The problem is putting the same code in a `craftEffect`. This is exactly the
case rejected by `assertCraftEffectNoImperativeSync`:

```typescript
craftEffect('sync', function* () {
  yield* searchResults.set(yield* rawResults());
  yield* usersQuery.call(yield* searchTerm());
  yield* saveMutation.mutate(yield* draft());
});
```

The rule is therefore not saying that `yield* searchResults.set(...)` is
invalid TypeScript or invalid Craft syntax. It is saying that a reactive
effect must not imperatively write or trigger another Craft primitive.

## What it prevents

This effect creates three hidden edges in the Craft graph:

```typescript
craftEffect('sync', function* () {
  yield* searchResults.set(yield* rawResults());
  yield* usersQuery.call(yield* searchTerm());
  yield* saveMutation.mutate(yield* draft());
});
```

The graph is effectively:

```text
sync effect ──writes──▶ searchResults
           ├─calls────▶ usersQuery
           └─calls────▶ saveMutation
```

Whenever one of the values read by the effect changes, the effect can write
state, start a query and start a mutation again. The direction of data flow is
hidden in a callback, which can create feedback loops, duplicate requests or a
mutation that runs merely because a signal was read.

## Use the primitive that owns the relationship instead

If the query depends on `searchTerm`, make that dependency explicit with
`params`:

```typescript
const usersQuery = yield* query('usersQuery', {
  params: searchTerm,
  loader: ({ params }) => searchUsers(params),
});
```

If all three operations belong to one explicit user action, use `craftMethod`
instead of `craftEffect`:

```typescript
const sync = craftMethod('sync', function* () {
  yield* searchResults.set(yield* rawResults());
  yield* usersQuery.call(yield* searchTerm());
  yield* saveMutation.mutate(yield* draft());
});
```

Call `sync` from the submit or click handler. It then runs once per explicit
invocation, rather than once per reactive recomputation.

For a mutation-to-query relationship, use an insertion such as
`insertReactOnMutation`. For a named external event, use `on$`. Use a computed
value when `searchResults` is only a transformation of `rawResults`, instead
of storing a second value and synchronising it.

Logging, focus and other effects that do not push into Craft primitives remain
valid. The rule protects synchronization, not all side effects.

## See also

- [Reacting to mutations](/guide/state/react-on-mutation)
- [From event to source](/guide/reactivity/from-event-to-source)
