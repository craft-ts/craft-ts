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
logic factory, a `craftService` factory, a `craftComputed`, a `craftMethod`,
`craftGen`, a route helper — `yield*` is the driver. The entity that yields
records the dependency on **its** graph:

```typescript
const tasks = yield* state('tasks', []);
```

`yield*` also folds whatever the primitive depends on into the enclosing
dependency tree, which is what the route DI check and the test registers read.

::: tip `craftUse` is for Angular interop
In an Angular `@Component` class there is no generator to yield from, so you
drive the primitive with `craftUse(state('tasks', []))` in a class field
instead. Same primitive, same result — but a class field is the end of the
graph, so there is nothing to track into.
:::

## It resolves to the primitive reference

Every named primitive returns its reference directly:

```typescript
const tasks = yield* state('tasks', []);
```

A factory arrow can return a single primitive directly. `craftService` drives it
and exposes the primitive reference itself:

```typescript
const { MyService } = craftService(
  { name: 'MyService', providedIn: 'global' },
  () => state('counter', 0),
);
```

When a factory exposes several primitives, wrap the record with
`craftYieldRecord`. It yields each primitive generator and keeps the record
keys in the returned value:

```typescript
import {
  craftComputed,
  craftService,
  craftYieldRecord,
  query,
  state,
  type CraftServiceInput,
} from '@craft-ts/core';

const { UserQuery } = craftService(
  { name: 'UserQueryWithState', providedIn: 'global' },
  (inputs: { userId: CraftServiceInput<string | undefined> }) =>
    craftYieldRecord({
      userQuery: query('userQuery', {
        params: function* () {
          return yield* inputs.userId();
        },
        loader: ({ params }) => ApiService.getItemById(params),
      }),
      refresh: state('refresh', 0, ({ update }) => ({
        increment: () => update((value) => value + 1),
      })),
    }),
);
```

Use the direct return for one primitive and `craftYieldRecord` for a record of
primitives. Inside a generator factory, the equivalent explicit form remains
available: `const userQuery = yield* query(...)`.

## Insertions add to the result

The last argument receives the primitive's internals and returns what to expose:

```typescript
state('counter', 0, ({ state, update }) => ({
  increment: () => update((value) => value + 1),
  isEven: craftComputed(function* () {
    return (yield* state()) % 2 === 0;
  }),
}));
```

Compose several with the primitive-specific helpers described in
[Typed insertion pipes](/guide/concepts/insertion-pipes). An insertion can also
be a `function*`, in which case it can `yield*` services. A derived value or
generator method must yield readers it does not own — including this
primitive's `state()` / `update()` when the member is a generator. Keep
[`craftPipe`](/guide/concepts/insertions) for universal or nested compositions.

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

## Injectable runtime context

Everyday insertions already receive `set`, `update`, and `patch` as arguments.
Keep using that.

Each primitive also **provides those same writes through Angular DI** on every
insertion method. Wrappers, registries, tests, WebMCP tools, and other
advanced patterns can recover them without being passed the insertion context
— for example to seed a query result, patch a mutation value, or drive a
`state` from a
[`provideFnWrapper`](/guide/advanced/observability#providefnwrapper).

That is also the surface a WebMCP client uses to inspect and mutate a live
primitive: `get` / `set` / `update` / `patch` on a query result, a `state`, a
mutation, an `asyncProcess`, or `queryParams`, without editing TypeScript or
reloading the page.

The helpers return `undefined` outside an insertion-method injection context.
Use the one that matches the primitive, or the generic helper and branch on
`kind`:

| Primitive      | Helper                                      |
| -------------- | ------------------------------------------- |
| `state`        | `injectStateMethodRuntimeContext()`         |
| `query`        | `injectQueryMethodRuntimeContext()`         |
| `mutation`     | `injectMutationMethodRuntimeContext()`      |
| `queryParams`  | `injectQueryParamsMethodRuntimeContext()`   |
| `asyncProcess` | `injectAsyncProcessMethodRuntimeContext()`  |
| any of them    | `injectPrimitiveMethodRuntimeContext()`     |

The context is the same shape everywhere:

```typescript
{
  kind: 'state' | 'query' | 'mutation' | 'queryParams' | 'asyncProcess';
  get(): unknown;
  set(value: unknown): unknown;
  update(updater: (current: unknown) => unknown): unknown;
  patch(updater: (current: unknown) => object): unknown;
  originalSource: string;
}
```

`patch` merges objects. Use `update` to replace arrays or primitives. Nested
[`insertSelect`](/guide/state/select) methods receive the selected slice, not
the root.

```typescript
import {
  injectQueryMethodRuntimeContext,
  provideFnWrapper,
} from '@craft-ts/core';

provideFnWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (factory, thisArg, args) {
    const query = injectQueryMethodRuntimeContext();
    const result = yield* factory.apply(thisArg, args);
    query?.patch((current) => ({ ...current, viewed: true }));
    return result;
  },
);
```

`query`, `mutation`, `asyncProcess`, and `queryParams` also publish the
**primitive value itself** — not only its methods — through
`providePrimitiveResourceRuntimeObserver`. Register it on the primitive's
`providers` (or higher). The observer runs at creation; keep the context if
you need to write later. Grouped resources take an optional `id` equivalent to
`.select(id)`. `state` has no resource observer: only the method context.

```typescript
import {
  providePrimitiveResourceRuntimeObserver,
  query,
  type PrimitiveResourceRuntimeContext,
} from '@craft-ts/core';

let usersRuntime: PrimitiveResourceRuntimeContext | undefined;

const users = yield* query('users', {
  providers: [
    providePrimitiveResourceRuntimeObserver((context) => {
      if (context.kind === 'query') {
        usersRuntime = context;
      }
    }),
  ],
  params: () => true,
  loader: function* () {
    return yield* UserApi.list();
  },
});

usersRuntime?.set([{ id: 'stub', name: 'Preview' }]);
```

The Angular `InjectionToken` behind these helpers is not part of the public
API. Inject the helpers; do not look up the token yourself.

## Reading a value that may have failed

The async primitives (`query`, `mutation`, `asyncProcess`) expose one value reader:

- `value()` — never throws, returns `undefined` when no value is available.

::: tip
Pass `query.value` to a template binding. Inside a generator, `yield* query.value()`.
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

**Don't inject the runtime context from feature insertions.** The insertion
already receives typed `set` / `update` / `patch` as arguments. The injectable
helpers are untyped and exist for wrappers, registries, WebMCP tools, and
other advanced patterns.

## See Also

- [Which primitive should I use?](/guide/concepts/choose-primitive)
- [Insertions](/guide/concepts/insertions)
- [Generators and `yield*`](/guide/concepts/generators)
- [Observability](/guide/advanced/observability) — `provideFnWrapper` as a
  consumer of the runtime context
