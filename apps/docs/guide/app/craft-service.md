# craftService

A service is a factory with a **name** and a **scope** — not a class. It packages
primitives and dependencies behind an explicit API, and keeps the whole
dependency graph visible to the compiler.

**Use it when** a component or route needs an owned state/context service, or
when reusable domain logic should be composed by other services.
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

- `craftPrivate(generator)` keeps its yielded values internal. It works for a
  primitive, a service dependency, or a `craftGen` helper creating several
  primitives.
- `craftExpose(name, value)` exposes a standalone value or gives a value a
  deliberate public name.
- Yield a service directly to expose it under its lower-camel-case name. Yield
  one of its members with the property shortcut to expose only that member:

  ```typescript
  function* () {
    yield* I18n.translate();
    yield* I18n.language();
    yield* ClientCurrency();
  }
  ```

  This exposes `translate`, `language`, and `clientCurrency`. Dependencies
  consumed inside nested callbacks are tracked without becoming service API
  members.
- Two exposed primitives cannot share a name: the service throws when it is
  created.

A `return` is a type error, and an error at runtime. The
`craft-ts/no-craft-service-return` lint rule reports it, and fixes the simple
case.

## Service inputs

Factory inputs must match the service scope. Call-site inputs belong to a
`function` service. Global services have no factory inputs; provider-scoped
services receive their instance configuration only through `$provided`.
`abstract` declares a contract and has no concrete factory to configure.

| Scope | Factory inputs |
| --- | --- |
| `global` | None |
| `toProvide` | `$provided` only |
| `manuallyProvidedAtRoot` | `$provided` only |
| `function` | Call-site inputs only |
| `abstract` | No concrete factory |

Values that can change should be consumed as yieldable readers
(`CraftServiceInput<T>`), the service counterpart of a component `Input<T>`.
Yield them so the input-to-service edge stays in the dependency graph:

```typescript
import { craftService, query, type CraftServiceInput } from '@craft-ts/core';

const { UserQuery } = craftService(
  { name: 'UserQuery', providedIn: 'function' },
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

The call site still accepts a resolved value, a signal, or a Craft reader — the
service boundary adapts it into that reader. Inside the factory, always
`yield* inputs.x()`.

Use `function` when each call should create a fresh service context, such as a
reusable query helper called with different parameters by other services. Do
not use it as a component's state store: repeated helper calls create distinct
contexts. Pass all per-call values as ordinary inputs, such as
`UserQuery({ userId })`.

Provider-scoped services have no call-site bindings. Put their values under
`$provided` and pass them when registering the service. When values come from a
component's own inputs, use `withComponentProviders` so each rendered component
instance gets one configured service scope:

```typescript
import {
  craftComponent,
  p,
  withComponentProviders,
  type Input,
} from '@craft-ts/component';
import {
  craftComputed,
  craftService,
  type CraftServiceInput,
} from '@craft-ts/core';

const { ProfileContext, provideProfileContext } = craftService(
  { name: 'ProfileContext', providedIn: 'toProvide' },
  function* (inputs: {
    $provided: { profileId: CraftServiceInput<string> };
  }) {
    yield* craftComputed('profileId', function* () {
      return yield* inputs.$provided.profileId();
    });
  },
);

const Profile = craftComponent(
  'Profile',
  {},
  (_inputs: { profileId: Input<string> }) => p(ProfileContext.profileId),
).pipe(
  withComponentProviders(({ profileId }) => [
    provideProfileContext({ profileId }),
  ]),
);
```

Registering `provideProfileContext(...)` does not run the service factory.
Angular creates and caches that scoped instance the first time its token is
resolved. `appStart: true` is the eager exception: startup resolution runs the
service during app initialization.

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

`scope` determines where a service instance lives and how it receives
configuration: `function`, `toProvide`, `global`, `manuallyProvidedAtRoot` or
`abstract`. Choose `toProvide` for state/context owned by a component or route,
and `function` for reusable per-call logic. The full decision guide is
**[Service scopes](/guide/app/service-scopes)**.

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

**Using `craftExpose` for a same-name service value.** Yield the service or its
property directly (`yield* ClientCurrency()` or `yield* I18n.language()`). The
`craft-ts/prefer-direct-craft-service-exposure` rule reports wrappers that only
repeat that name, including a dependency wrapped in `craftPrivate(...)` before
being exposed. Keep `craftExpose` for standalone or computed values. A member
already returned by a public primitive cannot be re-exposed under another
name; consumers should keep using its nested path.

The same rule rejects `craftExpose` inside `state`, `queryParams`, `mutation`,
`query`, and `asyncProcess` declarations or callbacks. Declare and yield
services and primitives in the `craftService` generator body so their public
names and dependencies stay visible there. A `craftExpose` that repeats the
primitive's declared name is also redundant because the primitive is already
exposed under that name.

Members returned by a public primitive are already available below that
primitive. If `state('searchInput', ...)` returns a `setSearchInput` method,
consumers can use `DebouncedWebSearchView.searchInput.setSearchInput(...)`.
Do not flatten it with
`craftExpose('setSearchInput', searchInput.setSearchInput)`; the same rule
reports that duplicate path. Remove the exposure and update its callers to
the nested member.

**Exposing a `craftMethod` to be yielded.** A `craftMethod` taken from a service
runs when it is called. To hand consumers a generator they `yield*`, expose the
`craftGen` itself: `yield* craftExpose('load', craftGen(function* () { … }))`.

**Exposing a derived value as a generator.** A zero-argument generator whose
only statement returns a value derived from `yield*` reads models a reactive
value. Declare it directly with `craftComputed` instead of exposing the
generator function (or wrapping it in `craftGen`):

```typescript
yield* craftComputed('system', function* () {
  return DEMO_CLIENTS[yield* clientCurrency.client()].units;
});
```

`craft-ts/prefer-craft-computed-for-reactive-generator` flags this shape.
Parameterized generators and multi-step generators remain valid for
operations and workflows.

## See Also

- [Service scopes](/guide/app/service-scopes) — the one decision to make
- [Shaping the public API](/guide/app/expose-api)
- [Testing services](/guide/testing/services)
