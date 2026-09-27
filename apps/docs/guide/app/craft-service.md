# craftService

A service is a factory with a **name** and a **scope** — not a class. It packages
primitives and dependencies behind an explicit API, and keeps the whole
dependency graph visible to the compiler.

**Use it when** logic outgrows a single component field, or when two places need
the same behaviour.
Use a small adapter when a dependency is owned by the runtime environment
rather than by your application.

The contrast with `inject(...)` scattered across classes is the point:
dependencies here are explicit and **type-visible**, which is what the route DI
check and the test registers read.

```typescript
import { craftService } from '@craft-ts/core';
```

## What a service exposes

A service never returns. Its factory is a generator, and **every named primitive
it yields is exposed under its name** — the name is already the primitive's
first argument, so it is not written twice:

```typescript
import { craftPrivate, craftService, query, state } from '@craft-ts/core';

const { TodoStore } = craftService(
  { name: 'TodoStore', providedIn: 'global' },
  function* () {
    // Internal: created and tracked, not part of the API.
    const draft = yield* craftPrivate(state('draft', ''));

    // Exposed as `todos`.
    yield* query('todos', {
      params: function* () {
        return yield* draft();
      },
      loader: ({ params }) => TodoApi.search(params),
    });
  },
);

// const { todos } = yield* TodoStore();
```

- `craftPrivate(primitive)` keeps a primitive internal. It works on any
  generator, a `craftGen` helper creating several primitives included.
- `craftExpose(name, value)` exposes what is not a named primitive: a function,
  a constant, a member of an injected service.
- The services a factory injects (`yield* ApiService()`) are not exposed.
- Two exposed primitives cannot share a name: the service throws when it is
  created.

A `return` is a type error, and an error at runtime. The
`craft-ts/no-craft-service-return` lint rule reports it, and fixes the simple
case.

## Service inputs

Service inputs that can change should be consumed as yieldable readers
(`CraftServiceInput<T>`), the service counterpart of a component `Input<T>`.
Yield them so the input-to-service edge stays in the dependency graph:

```typescript
import { craftService, query, type CraftServiceInput } from '@craft-ts/core';

const { UserQuery } = craftService(
  { name: 'UserQuery', providedIn: 'global' },
  function* (inputs: { userId: CraftServiceInput<string | undefined> }) {
    yield* query('userQuery', {
      params: function* () {
        return yield* inputs.userId();
      },
      loader: ({ params }) => ApiService.getItemById(params),
    });
  },
);
```

The call site still accepts a resolved value, a signal, or a Craft
reader — the service boundary adapts it into that reader. Inside the factory,
always `yield* inputs.x()`.

## What you get

Declaring a service gives you a set of generated helpers. For one named
`Counter`:

- `Counter(...)` — consume or compose it inside a craft generator
- `Counter.someProperty(...)` — derive one public property directly
- `provideCounter(...)` — for provider-capable scopes
- `COUNTER_META_DATA` — for metadata-driven tooling
- `CounterRequirement` — for `abstract` services
- `provideCounter(factory)` — on `abstract` services, to implement the contract
  inline

Which of those exist depends on the scope.

::: warning Breaking change — no more `injectX`
The generated helper is the service name itself: `X`. `craftService` no longer
exports `injectX`, and the former `XToYield` helper is gone. Use `X()` in a craft
generator and compose with `yield* X()`.
:::

## Supported scopes

A service declares how many instances of it exist through `scope`:
`function`, `toProvide`, `global`, `manuallyProvidedAtRoot` or `abstract`.
Default to `function`.

Each scope and when to pick it: **[Service scopes](/guide/app/service-scopes)**.

## The common case

<<< @/tests/snippets/guide/app/craft-service/example-3.spec.ts#example-3

## Scoping providers to the service

Use `providers` in the service config when the service factory itself needs locally-scoped dependencies:

```typescript
const { UserFacade } = craftService(
  {
    name: 'UserFacade',
    providedIn: 'global',
    providers: [provideUserApi(), provideUserLogger()],
  },
  function* () {
    const api = yield* UserApi();
    const logger = yield* UserLogger();

    yield* craftExpose('rename', (user: { id: string; name: string }, name: string) => {
      logger.log(`rename:${user.id}`);
      return api.updateUser({ ...user, name });
    });
  },
);
```

This is separate from `provideUserFacade()`, which is only generated for provider-capable scopes like `toProvide`.

## Composing services

<<< @/tests/snippets/guide/app/craft-service/example-7.spec.ts#example-7

## Shaping the public API

`yield* X()` can expose only part of a dependency, and `X.property()` derives a
single one. See **[Shaping a service's public API](/guide/app/expose-api)**.

## Contracts without an implementation

`scope: 'abstract'` declares a contract that a provider must satisfy later. See
**[Abstract services](/guide/app/abstract-services)**.

## Startup work

`craftService` also supports startup hooks through `appStart: true` and `yield* onAppStart(...)`.

The callback can be a plain function or a generator function. Use the generator form when startup logic needs to `yield*` crafted dependencies:

<<< @/tests/snippets/guide/app/app-start/appconfig.spec.ts#appconfig

Dependencies used only inside that callback are still tracked on the parent service.

## Pitfalls

**Reaching for `global` by default.** A global service is a singleton for the
whole app, whether or not that was intended. Start at `function` — see
[Service scopes](/guide/app/service-scopes).

**`toProvide` without the provider.** A missing provider is reported by the route
at compile time; the failure appears at runtime. The
[route DI check](/guide/routing/setup) is what closes that hole.
[Architecture tests](/guide/testing/architecture#assertroutediproofs) keep that
check from quietly disappearing — a `CanRun` alias that nobody references still
compiles.

**Exposing the whole world.** What a service yields is its API. Keep what
consumers do not need in `craftPrivate(...)`; consumers that need more can
yield more.

**Exposing a `craftMethod` to be yielded.** A `craftMethod` taken from a service
runs when it is called. To hand consumers a generator they `yield*`, expose the
`craftGen` itself: `yield* craftExpose('load', craftGen(function* () { … }))`.

## See Also

- [Service scopes](/guide/app/service-scopes) — the one decision to make
- [Shaping the public API](/guide/app/expose-api)
- [Testing services](/guide/testing/services)
