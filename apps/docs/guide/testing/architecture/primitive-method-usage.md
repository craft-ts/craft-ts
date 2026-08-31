# Primitive method usage

`assertPrimitiveMethodsUsedOnce` requires every method exposed by a primitive
insertion to have one source-level call site. It complements
`craft-ts/no-reused-primitive-method`, which checks usages inside one file.

<<< @/tests/snippets/guide/testing/architecture/primitive-method-usage.spec.ts#example

The rule applies to methods returned by insertions on `state`, `query`,
`mutation`, `asyncProcess` and `queryParams`. A callback reference counts as a
usage just like an explicit generator call:

```typescript
button({ click: counter.increment });
yield* counter.increment();
```

Two distinct source locations must have distinct names so the method itself
explains its context:

```typescript
const counter = yield* state('counter', 0, ({ update }) => ({
  incrementFromToolbar: () => update((value) => value + 1),
  incrementFromKeyboard: () => update((value) => value + 1),
}));
```

Methods bound internally with `on$` are not exposed and are not checked. A
single call inside a loop is also one call site: the rule concerns the source
shape, not how many times the application executes it.

The architecture assertion keeps the invariant across service, component and
feature-file boundaries. Its error lists every known file and line so the
method can be split into context-specific methods.

## See also

- [`craft-ts/no-reused-primitive-method`](/guide/routing/eslint-rules)
- [Insertions](/guide/concepts/insertions)
- [The architecture graph](/guide/testing/architecture)
