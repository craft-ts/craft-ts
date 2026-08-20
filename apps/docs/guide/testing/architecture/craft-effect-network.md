# Keep `craftEffect` off the network

`assertCraftEffectNoNetwork` prevents a reactive `craftEffect` from calling HTTP
or a mutation:

```typescript
it('keeps network work in resources', () => {
  assertCraftEffectNoNetwork(graph.graph);
});
```

## What it prevents

This is a query disguised as an effect:

```typescript
craftEffect('poll', function* () {
  yield* CraftHttpClient.get(loadUsers);
});
```

It has no standard query loading state, cache identity, cancellation contract or
read-side exception flow. It can also run again whenever an unrelated reactive
dependency changes.

This is a mutation disguised as an effect:

```typescript
craftEffect('save', function* () {
  yield* saveMutation.mutate(payload);
});
```

The write has no explicit user action or mutation relationship in its declaration.

## The intended alternatives

- use `query` / `queryEffect` for reads;
- use `mutation` / `mutationEffect` for writes;
- use `asyncProcess` / `asyncProcessEffect` for explicit commands;
- keep `craftEffect` for reactive side effects such as logging, focus or
  integration with a non-Craft sink.

The rule protects the semantic boundary, not the use of Effects in general.

## See also

- [craftEffect](/guide/reactivity/craft-effect)
- [Which primitive should I use?](/guide/concepts/choose-primitive)
