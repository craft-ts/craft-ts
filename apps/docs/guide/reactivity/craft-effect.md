# craftEffect

An `effect` that can resolve craft dependencies with `yield*`.

**Use it when** a side effect needs a service.
**Not as a way to sync state** — if a value is a function of another, derive it
with `computed` instead of writing it from an effect.

## Import

```typescript
import { craftEffect } from '@craft-ng/core';
```

```typescript
craftEffect('myEffect', function* () {
  const counter = yield* Counter();
  // do some stuff
});
```

## Resource triggers

In generator code, primitive triggers are yieldable and must be consumed with
`yield*`:

```typescript
function* submit(term: string) {
  yield* searchQuery.call(term);
  yield* saveMutation.mutate({ term });
  yield* validateProcess.method(term);
}
```

Imperative triggers from ordinary UI callbacks remain valid:

```typescript
button({ click: () => saveMutation.mutate({ term: input() }) }, 'Save');
```

Do not use those triggers as dependencies of a `craftEffect`. Prefer a
declarative `params` signal, a `source$`, or a mutation/query insertion. The
`craft-ng/no-imperative-craft-resource-trigger` rule also follows a
`craftGen`, so wrapping the call does not bypass the restriction:

```typescript
const triggerSearch = craftGen(function* (term: string) {
  yield* searchQuery.call(term);
});

craftEffect('load', function* () {
  yield* triggerSearch(input()); // forbidden: indirect imperative trigger
});
```

Use a reactive query instead when the data depends on a signal:

```typescript
const user = yield* query('user', {
    params: userId,
    loader: ({ params }) => fetchUser(params),
  });
```

## See Also

- [craftComputed](/guide/reactivity/craft-computed)
- [craftMethod](/guide/reactivity/craft-method)
- [Local state](/guide/state/local-state) — deriving instead of writing from an effect
- [Architecture rules](/guide/testing/architecture) — `assertCraftEffectNoNetwork` when an effect calls HTTP or a mutation
