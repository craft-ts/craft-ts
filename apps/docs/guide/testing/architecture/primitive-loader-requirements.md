# Primitive loader requirements

`assertPrimitiveLoaderRequirements` is the configurable form of the server-state
rule. It says what a primitive loader must reach, without hard-coding one
transport library into the graph:

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

## What it prevents

An Effect-aware query can look perfectly typed while accidentally becoming a
local computation:

```typescript
const users = yield* queryEffect('users', {
  params: () => filter(),
  loader: () => Effect.succeed(localFixture),
});
```

That is a valid Effect program, but it does not prove that the feature reaches a
repository, gateway or other server-state boundary. The rule makes the policy
explicit and catches the accidental local fallback.

## Requirements are OR-ed

A project can accept several boundary styles:

```typescript
requirements: [
  { label: 'Effect service', matches: isEffectService },
  { label: 'domain gateway', matches: isDomainGateway },
  { label: 'server function', matches: isServerFunctionFamily },
]
```

For `queryEffect` and `mutationEffect`, the graph projects the Effect `R`
channel onto the matching Effect service nodes. A loader that calls a domain
function requiring `UserRepository` therefore satisfies the rule even though
the loader itself does not directly yield the service.

## Use `allow` as a documented exception

```typescript
assertPrimitiveLoaderRequirements(graph.graph, {
  primitives: ['queryEffect'],
  requirements: [{ label: 'Effect service', matches: isEffectService }],
  allow: ['currentUserQuery'], // app-level DI bridge; intentionally local
});
```

The name should explain the exception. A broad allowlist defeats the point of a
loader-boundary rule.

## See also

- [Server-state loader rule](./server-state-loader)
- [Effect integration](/guide/advanced/effect)
