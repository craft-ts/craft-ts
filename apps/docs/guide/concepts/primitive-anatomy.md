# Anatomy of a primitive

The five primitives — `state`, `query`, `mutation`, `queryParams`,
`asyncProcess` — share one shape. Learn it once here; each primitive's page then
only covers what is specific to it.

## The shape

```typescript
primitive(name, config, insertion?);
```

- **`name`** — always first, always a string literal.
- **`config`** — what the primitive needs to do its job (an initial value, a
  loader, a codec map…). This is the part that differs between primitives.
- **`insertion`** — optional, adds methods and computed values to the result.

## Naming is not decoration

The name tags the primitive's injector — `state:tasks`, `query:userQuery` — and
is what identifies it in logs, snapshots and the observability tooling. Two
primitives with the same name in the same scope are two different things wearing
one label, and the tooling cannot tell them apart.

## Driving it with `yield*`

A primitive does not run itself. Inside any generator host — a `craftComponent`
logic factory, a `craftService` factory, `craftGen`, a route helper — `yield*` is
the driver:

```typescript
const { tasks } = yield* state('tasks', []);
```

`yield*` also folds whatever the primitive depends on into the enclosing
dependency tree, which is what the route DI check and the test registers read.

::: tip `craftUse` is for Angular interop
In an Angular `@Component` class there is no generator to yield from, so you
drive the primitive with `craftUse(state('tasks', []))` in a class field
instead. Same primitive, same result — but a class field is the end of the
graph, so there is nothing to track into.
:::

## It resolves to a single-key record

Every primitive returns a record keyed by its name, so you always destructure:

```typescript
const { tasks } = yield* state('tasks', []);
// or
const tasks = (yield* state('tasks', [])).tasks;
```

A factory arrow returning the primitive directly resolves to the **record**, not
the ref. When a service should expose the ref itself, drive the primitive and
return it:

```typescript
craftService({ name: 'MyService', scope: 'global' }, function* () {
  const { counter } = yield* state('counter', 0);
  return counter;
});
```

## Insertions add to the result

The last argument receives the primitive's internals and returns what to expose:

```typescript
state('counter', 0, ({ state, update, set }) => ({
  increment: () => update((value) => value + 1),
  isEven: computed(() => state() % 2 === 0),
}));
```

Compose several with [`craftPipe`](/guide/concepts/insertions). An insertion can
also be a `function*`, in which case it can `yield*` services.

## Scoped providers

Every primitive config accepts `providers`, for dependencies that should be
scoped to this primitive alone rather than to the whole service:

```typescript
query('userQuery', {
  providers: [provideUserApiService()],
  loader: function* () {
    return yield* UserApiService.get();
  },
});
```

## Reading a value that may have failed

The async primitives (`query`, `mutation`, `asyncProcess`) expose two readers:

- `value()` — **throws** when the status is `'exception'`;
- `safeValue()` — never throws, returns `undefined` instead.

::: tip Prefer `safeValue()` in templates and computed signals
A throw inside a template or a `computed` propagates in ways that are hard to
trace. Use `safeValue()` there and handle the exception explicitly.
:::

## Pitfalls

**A primitive invocation is single-use.** Each call produces one generator, to be
consumed exactly once. Storing one and `yield*`-ing it twice does not give you
two primitives — it fails.

**It must run in an injection context.** A field initialiser, a constructor, a
craft factory. Called outside one, a primitive returns only its configuration
under `_config` instead of a live ref — which usually surfaces later as a
confusing "not a function" error.

**Methods bound to a source with `on$` are not exposed on the result.** They
work internally, driven by the source, and do not appear on the ref.

## See Also

- [Which primitive should I use?](/guide/concepts/choose-primitive)
- [Insertions](/guide/concepts/insertions)
- [Generators and `yield*`](/guide/concepts/generators)
