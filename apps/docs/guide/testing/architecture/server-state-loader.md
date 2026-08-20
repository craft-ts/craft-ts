# Queries and mutations must reach server state

`assertQueryMutationHasServerState` verifies that `query` and `mutation`
loaders reach an approved server-state boundary, such as `CraftHttpClient` or a
client-exposed server-function family:

```typescript
it('keeps server resources connected to server state', () => {
  assertQueryMutationHasServerState(graph.graph);
});
```

## What it prevents

This resource is named like server state but only returns local data:

```typescript
const users = yield* query('users', {
  params: () => filter(),
  loader: () => cachedUsers,
});
```

That can be intentional in a demo, but in a production feature it hides a
missing API call or accidentally replaces a remote source with a fixture. The
query's loading and cache semantics then give a false impression that the server
has been consulted.

## Effect applications choose their boundary

An Effect app can use a custom requirement instead of making every loader call
`CraftHttpClient`:

```typescript
assertPrimitiveLoaderRequirements(graph.graph, {
  primitives: ['queryEffect', 'mutationEffect'],
  requirements: [
    {
      label: 'an Effect service',
      matches: ({ target }) =>
        target.kind === 'service' && target.details?.runtime === 'effect',
    },
  ],
});
```

For local fixtures, use a narrow named `allow` entry and explain why it is not
server state. Do not disable the rule for every primitive.

## See also

- [Which primitive should I use?](/guide/concepts/choose-primitive)
- [Primitive loader requirements](./primitive-loader-requirements)
- [Effect integration](/guide/advanced/effect)
