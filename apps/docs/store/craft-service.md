# craftService

Creates a named Angular-friendly service boundary with generated inject, yield, provider, and metadata helpers.

## Import

```typescript
import { craftService } from '@craft-ng/core';
```

## Introduction

`craftService` is the service-oriented composition API for `@craft-ng`.

It lets you:

- define a service once with a stable name and scope
- inject it through a generated `injectX()` helper
- compose it into another service through `yield* XToYield()`
- expose only part of a dependency through derived bindings
- generate typed provider helpers for provider-capable scopes
- keep the full dependency graph available for testing utilities

Unlike ad-hoc `inject(...)` calls spread across services, `craftService` makes dependencies explicit and type-visible.

## Generated Helpers

For a service named `Counter`, `craftService` can generate:

- `injectCounter(...)` to resolve the service in components/directives
- `CounterToYield(...)` to compose it inside another `craftService`
- `CounterToYield.someProperty(...)` to derive one public property directly
- `provideCounter(...)` for provider-capable scopes
- `COUNTER_META_DATA` for metadata-driven tooling
- `CounterRequirement` for `abstract` services

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

const { injectAppStartLog } = craftService(
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
```

Dependencies used only inside that callback are still tracked on the parent service.

## Basic Example

```typescript
import { craftService, state } from '@craft-ng/core';

const { injectCounter } = craftService(
  { name: 'Counter', scope: 'global' },
  () =>
    state(0, ({ update }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
    })),
);

const counter = injectCounter();
counter.increment();
console.log(counter());
```

## Add providers to craftService

Use `providers` in the service config when the service factory itself needs locally-scoped dependencies:

```typescript
const { injectUserFacade } = craftService(
  {
    name: 'UserFacade',
    scope: 'global',
    providers: [provideUserApi(), provideUserLogger()],
  },
  function* () {
    const api = yield* UserApiToYield();
    const logger = yield* UserLoggerToYield();

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
const { CounterToYield } = craftService(
  { name: 'Counter', scope: 'global' },
  () =>
    state(0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    })),
);

const { injectCounterFacade } = craftService(
  { name: 'CounterFacade', scope: 'global' },
  function* () {
    const counter = yield* CounterToYield();

    return {
      read: () => counter(),
      increment: () => counter.increment(),
    };
  },
);
```

## Single Property Shortcut

When only one public property is needed, `XToYield.property()` is a shortcut for
a one-property derivation.

```typescript
const { UsersApiToYield } = craftService(
  { name: 'UsersApi', scope: 'global' },
  () => ({
    updateUser: (user: { id: string; name: string }) => Promise.resolve(user),
    getUsers: () => Promise.resolve([]),
  }),
);

const { injectUserUpdater } = craftService(
  { name: 'UserUpdater', scope: 'global' },
  function* () {
    const updateUser = yield* UsersApiToYield.updateUser();

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
return yield * UsersApiToYield.updateUser({ id: '1', name: 'Romain' });
```

The shortcut accepts the same bindings as `XToYield(...)`:

```typescript
const increment = yield * CounterToYield.increment({ initialValue: 0 });
```

Use the full `XToYield(bindings, expose)` form when deriving several
properties, creating aliases, exposing `$self`, using symbol keys, or when a
service property collides with a native function property such as `name`.

## Inject Single Property Shortcut

The same shortcut notation is available on the `injectX` helper in components
and directives. Instead of selecting a single property through a selector
function, use `injectX.property()`:

```typescript
const { injectUsersApi } = craftService(
  { name: 'UsersApi', scope: 'global' },
  () => ({
    updateUser: (user: { id: string; name: string }) => {},
    currentUser: signal<{ id: string } | null>(null),
  }),
);

@Component({ ... })
class UserComponent {
  // equivalent to injectUsersApi(undefined, ({ currentUser }) => ({ currentUser })).currentUser
  readonly currentUser = injectUsersApi.currentUser();
}
```

The result carries the same dependency tracking as any other inject shortcut,
so testing utilities see exactly which property was accessed.

For method properties on services without public inputs, the shortcut calls the
method directly:

```typescript
protected readonly update = injectUsersApi.updateUser({ id: '1', name: 'New' });
```

## Nested Property Shortcuts

When only a sub-property of a service output is needed, add a second `.property`
before calling, for both `injectX` and `XToYield`:

```typescript
const { injectSearchApi, SearchApiToYield } = craftService(
  { name: 'SearchApi', scope: 'global' },
  () => ({
    usersQuery: {
      isLoading: signal(false),
      data: signal<string[]>([]),
    },
  }),
);

// In a component
@Component({ ... })
class SearchComponent {
  readonly isLoading = injectSearchApi.usersQuery.isLoading();
}

// In a service
const { injectSearchFacade } = craftService(
  { name: 'SearchFacade', scope: 'global' },
  function* () {
    const isLoading = yield* SearchApiToYield.usersQuery.isLoading();
    return { isLoading };
  },
);
```

The dependency graph records only the accessed nested property
(`derivedPropertiesUsed: { usersQuery: { isLoading: ... } }`), not the full
`usersQuery` object. Testing utilities therefore only require the used
sub-property in mock objects.

The result of `injectX.parent.child()` carries `WithTrackedDependencies` just
like any other inject helper result, so `ExtractDeps` on a component field built
from it will correctly surface the service dependency.

## OmitInputs

When a service has public inputs, the no-arg form of a property shortcut is
intentionally disabled at the type level, because calling without bindings would
silently use default values and mask a missing dependency:

```typescript
const { injectCounter, CounterToYield } = craftService(
  { name: 'Counter', scope: 'function' },
  (inputs: { initialValue?: MaybeSignal<number> }) => ({
    count: toValue(inputs.initialValue) ?? 0,
  }),
);

// Fine — bindings are explicit
const count = injectCounter.count({ initialValue: signal(5) });

// Type error — no-arg call is forbidden when inputs exist
// injectCounter.count();
```

Use `injectX.OmitInputs.property()` or `XToYield.OmitInputs.property()` to
explicitly opt out of input bindings and use the defaults:

```typescript
const count = injectCounter.OmitInputs.count();
const count2 = yield * CounterToYield.OmitInputs.count();
```

`OmitInputs` is purely a type-level gate — at runtime it is transparent.

`OmitInputs` composes with nested shortcuts:

```typescript
const isLoading = injectCounter.OmitInputs.userQuery.isLoading();
```

## Partial Exposure

`yield* XToYield()` can expose only the part of a dependency that should remain public.

```typescript
const { CounterToYield } = craftService(
  { name: 'Counter', scope: 'toProvide' },
  () =>
    state(0, ({ update }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
    })),
);

const { injectCounterExtended, provideCounterExtended } = craftService(
  { name: 'CounterExtended', scope: 'toProvide' },
  function* () {
    return yield* CounterToYield(undefined, ({ $self, increment }) => ({
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

## Testing

Complementary testing helper are designed around `craftService` metadata:

- [setupCraftServiceTestingByRegister](/store/setup-craft-service-testing-by-register) for exhaustive flat registers

## See Also

- [setupCraftServiceTestingByRegister](/store/setup-craft-service-testing-by-register)
- [toCraftService](/store/to-craft-service)
