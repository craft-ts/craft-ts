# craftService

Creates a named Angular-friendly service boundary with generated service, provider, and metadata helpers.

::: warning
I will try to align this API with others (make it yieldable in order to track source$ as a dependency).
:::

## Import

```typescript
import { craftService } from '@craft-ng/core';
```

## Introduction

`craftService` is the service-oriented composition API for `@craft-ng`.

It lets you:

- define a service once with a stable name and scope
- consume it through a generated `X()` generator
- compose it into another service through `yield* X()`
- expose only part of a dependency through derived bindings
- generate typed provider helpers for provider-capable scopes
- keep the full dependency graph available for testing utilities

Unlike ad-hoc `inject(...)` calls spread across services, `craftService` makes dependencies explicit and type-visible.

### Current API (breaking change)

The generated service helper is the service name itself: `X`. `craftService` no longer
exports `injectX`, and the former `XToYield` helper has been removed. Use `X()` in a craft generator and
compose it with `yield* X()`.

## Generated Helpers

For a service named `Counter`, `craftService` can generate:

- `Counter(...)` to consume or compose the service inside a craft generator
- `Counter.someProperty(...)` to derive one public property directly
- `provideCounter(...)` for provider-capable scopes
- `COUNTER_META_DATA` for metadata-driven tooling
- `CounterRequirement` for `abstract` services
- `provideCounter(factory)` on `abstract` services to implement the contract inline

The exact helpers depend on the chosen scope.

## Supported Scopes

### `global`

- singleton provided at root
- ideal for app-wide services and shared state
- no explicit `provideX()` helper

### `toProvide`

- requires `provideX()` where the service is mounted
- useful for feature-local service trees
- works well with tests that need explicit providers

### `manuallyProvidedAtRoot`

- explicit provider helper, but designed to be mounted at root
- also exposes `XToProvide` for public provider composition
- allows this scope to be yielded by global services, which is not possible with `toProvide` (it still requires explicit setup when testing with `setupCraftServiceTestingByRegister`).

### `function`

- creates a fresh instance on each injection
- useful for reusable factories with bindings and inputs

### `abstract`

- declares a contract without implementation
- exposes a requirement token to force a concrete implementation later

## Recommendations For Choosing a Scope

- Prefer `function` for a service owned by a single component. It avoids an explicit provider and makes it clear the instance is not meant to be shared with other components or child components.
- Move to `toProvide` when the same instance must be shared with child components, or across several components through a common parent or route. In that case, provide it at the component boundary, a parent component, or the route.
- Be careful with `toProvide`: Angular does not report a compilation error when the provider is missing, so the failure usually appears at runtime instead.
- Use `global` when the instance is intentionally shared application-wide.
- For startup-only logic that should run when the app boots but is not injected elsewhere, prefer `function` together with `provideAppInitializer(...)`. If the same instance also needs to be injected by other services, use `global` instead.

## App Start

`craftService` also supports startup hooks through `appStart: true` and `yield* onAppStart(...)`.

The callback can be a plain function or a generator function. Use the generator form when startup logic needs to `yield*` crafted dependencies:

```typescript
import { Console, craftService, onAppStart } from '@craft-ng/core';

const { AppStartLog } = craftService(
  {
    name: 'AppStartLog',
    scope: 'global',
    appStart: true,
  },
  function* () {
    yield* onAppStart(function* () {
      yield* Console.log('startup log');
      return Promise.resolve();
    });

    return true;
  },
);

// register the current service to the AppStartRegistry
// it is auto-generated when used with the craft-ng ESLint plugin
declare module '@craft-ng/core' {
  interface CraftAppStartRegistry {
    AppStartLog: typeof AppStartLog;
  }
}

// inside craftAppConfig
export const appConfig = craftAppConfig({
  appStart: {
    AppStartLog,
  },
});
```

Dependencies used only inside that callback are still tracked on the parent service.

## Basic Example

```typescript
import { craftService, state } from '@craft-ng/core';

const { Counter } = craftService(
  { name: 'Counter', scope: 'global' },
  function* () {
    const { counter } = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
    }));
    return counter;
  },
);

const { CounterConsumer } = craftService(
  { name: 'CounterConsumer', scope: 'global' },
  function* () {
    const counter = yield* Counter();
    counter.increment();
    return counter;
  },
);
```

## Add providers to craftService

Use `providers` in the service config when the service factory itself needs locally-scoped dependencies:

```typescript
const { UserFacade } = craftService(
  {
    name: 'UserFacade',
    scope: 'global',
    providers: [provideUserApi(), provideUserLogger()],
  },
  function* () {
    const api = yield* UserApi();
    const logger = yield* UserLogger();

    return {
      rename: (user: { id: string; name: string }, name: string) => {
        logger.log(`rename:${user.id}`);
        return api.updateUser({ ...user, name });
      },
    };
  },
);
```

This is separate from `provideUserFacade()`, which is only generated for provider-capable scopes like `toProvide`.

## Composition With `yield*`

```typescript
const { Counter } = craftService(
  { name: 'Counter', scope: 'global' },
  function* () {
    const { counter } = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    }));
    return counter;
  },
);

const { CounterFacade } = craftService(
  { name: 'CounterFacade', scope: 'global' },
  function* () {
    const counter = yield* Counter();

    return {
      read: () => counter(),
      increment: () => counter.increment(),
    };
  },
);
```

## Single Property Shortcut

When only one public property is needed, `X.property()` is a shortcut for
a one-property derivation.

```typescript
const { UsersApi } = craftService(
  { name: 'UsersApi', scope: 'global' },
  () => ({
    updateUser: (user: { id: string; name: string }) => Promise.resolve(user),
    getUsers: () => Promise.resolve([]),
  }),
);

const { UserUpdater } = craftService(
  { name: 'UserUpdater', scope: 'global' },
  function* () {
    const updateUser = yield* UsersApi.updateUser();

    return {
      rename: (user: { id: string; name: string }, name: string) =>
        updateUser({ ...user, name }),
    };
  },
);
```

For method properties on services without public inputs, the shortcut can call
the method directly:

```typescript
return yield * UsersApi.updateUser({ id: '1', name: 'Romain' });
```

The shortcut accepts the same bindings as `X(...)`:

```typescript
const increment = yield * Counter.increment({ initialValue: 0 });
```

Use the full `X(bindings, expose)` form when deriving several
properties, creating aliases, exposing `$self`, using symbol keys, or when a
service property collides with a native function property such as `name`.

## Property Shortcut

The same shortcut notation is available on the generated `X` helper. Use it
inside a craft generator when only one property is needed:

```typescript
const { UsersApi } = craftService(
  { name: 'UsersApi', scope: 'global' },
  () => ({
    updateUser: (user: { id: string; name: string }) => {},
    currentUser: signal<{ id: string } | null>(null),
  }),
);

const { CurrentUser } = craftService(
  { name: 'CurrentUser', scope: 'global' },
  function* () {
    return yield* UsersApi.currentUser();
  },
);
```

The result carries the same dependency tracking as `yield* UsersApi()`, so
testing utilities see exactly which property was accessed.

For method properties on services without public inputs, the shortcut calls the
method directly:

```typescript
const update = yield * UsersApi.updateUser({ id: '1', name: 'New' });
```

## Nested Property Shortcuts

When only a sub-property of a service output is needed, add a second `.property`
before calling:

```typescript
const { SearchApi } = craftService(
  { name: 'SearchApi', scope: 'global' },
  () => ({
    usersQuery: {
      isLoading: signal(false),
      data: signal<string[]>([]),
    },
  }),
);

const { SearchFacade } = craftService(
  { name: 'SearchFacade', scope: 'global' },
  function* () {
    const isLoading = yield* SearchApi.usersQuery.isLoading();
    return { isLoading };
  },
);
```

The dependency graph records only the accessed nested property
(`derivedPropertiesUsed: { usersQuery: { isLoading: ... } }`), not the full
`usersQuery` object. Testing utilities therefore only require the used
sub-property in mock objects.

The result of `yield* X.parent.child()` carries the same tracked dependency
metadata, so `ExtractDeps` correctly surfaces the service dependency.

## OmitInputs

When a service has public inputs, the no-arg form of a property shortcut is
intentionally disabled at the type level, because calling without bindings would
silently use default values and mask a missing dependency:

```typescript
const { Counter } = craftService(
  { name: 'Counter', scope: 'function' },
  (inputs: { initialValue?: MaybeSignal<number> }) => ({
    count: toValue(inputs.initialValue) ?? 0,
  }),
);

// Fine — bindings are explicit
const count = yield * Counter.count({ initialValue: signal(5) });

// Type error — no-arg call is forbidden when inputs exist
// Counter.count();
```

Use `X.OmitInputs.property()` to
explicitly opt out of input bindings and use the defaults:

```typescript
const count = yield * Counter.OmitInputs.count();
const count2 = yield * Counter.OmitInputs.count();
```

`OmitInputs` is purely a type-level gate — at runtime it is transparent.

`OmitInputs` composes with nested shortcuts:

```typescript
const isLoading = yield * Counter.OmitInputs.userQuery.isLoading();
```

## Partial Exposure

`yield* X()` can expose only the part of a dependency that should remain public.

```typescript
const { Counter } = craftService(
  { name: 'Counter', scope: 'toProvide' },
  function* () {
    const { counter } = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
    }));
    return counter;
  },
);

const { CounterExtended, provideCounterExtended } = craftService(
  { name: 'CounterExtended', scope: 'toProvide' },
  function* () {
    return yield* Counter(undefined, ({ $self, increment }) => ({
      $self,
      incrementCounter: increment,
    }));
  },
);
```

This keeps the dependency graph precise, which is important for both type inference and testing.

## Abstract Requirements

Use `scope: 'abstract'` to declare a contract that must be implemented elsewhere.

```typescript
import { abstract, craftService } from '@craft-ng/core';

type CounterContract = {
  (): number;
  increment(): void;
};

const { CounterRequirement } = craftService(
  { name: 'Counter', scope: 'abstract' },
  abstract<CounterContract>(),
);
```

Concrete services can then depend on `CounterRequirement`.

## Abstract Providers

An `abstract` service also exposes a `provideX(factory)` helper. It takes a **factory** — a plain
function or a generator — produces a value matching the contract, and binds it to the requirement
token. This lets you implement the contract **inline at the providing site** (a route, a component,
a feature config) instead of declaring a separate concrete `craftService`.

```typescript
import { abstract, craftService } from '@craft-ng/core';

type User = { name: string };

const { User, provideUser } = craftService(
  { name: 'User', scope: 'abstract' },
  abstract<User>(),
);

// Implement the contract inline:
const providers = [provideUser(() => ({ name: 'Ada' }))];

// Anywhere downstream, inside a craft generator:
const user = yield * User();
```

The factory can be a **generator** that yields other services. Everything it yields is tracked, so
the resulting provider participates in the cascade DI check just like a regular service:

```typescript
const { Greeting } = craftService(
  { name: 'Greeting', scope: 'global' },
  () => ({ prefix: 'Hello' }),
);

const providers = [
  provideUser(function* () {
    const greeting = yield* Greeting();
    return { name: `${greeting.prefix} Ada` };
  }),
];
```

This is the foundation of route-scoped providers: a route can implement an abstract contract from
its own guarded data / params. See
[Type-safe DI/Routes → Route Providers](/type-safe-di-routes/route-providers).

## Testing

Complementary testing helper are designed around `craftService` metadata:

- [setupCraftServiceTestingByRegister](/store/setup-craft-service-testing-by-register) for exhaustive flat registers

## See Also

- [setupCraftServiceTestingByRegister](/store/setup-craft-service-testing-by-register)
- [toCraftService](/store/to-craft-service)
