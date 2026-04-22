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
