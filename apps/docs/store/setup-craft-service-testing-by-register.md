# setupCraftServiceTestingByRegister

Sets up a `craftService` or `toCraftService` from an explicit flat register derived from the full dependency graph.

## Import

```typescript
import { setupCraftServiceTestingByRegister } from '@craft-ng/core';
```

## Introduction

`setupCraftServiceTestingByRegister` is the exhaustive testing utility for the `craftService` graph.

Instead of providing only the overrides you care about, you provide a full typed register where each service is marked as:

- real
- provided by its raw `provideX(...)`
- mocked with a raw object
- or pruned with `'notReached'`

This is useful when you want explicit control over every node in the service graph.

## Register Workflow

The intended workflow is:

1. start from the full dependency graph of the SUT
2. fill each key with a real provider, `'real'`, a mock object, or `'notReached'`
3. pass the register to `setupCraftServiceTestingByRegister(...)`

## Basic Example

```typescript
import {
  craftService,
  setupCraftServiceTestingByRegister,
  state,
} from '@craft-ng/core';
import { vi } from 'vitest';

const { CounterToYield } = craftService(
  { name: 'Counter', scope: 'global' },
  () =>
    state(10, ({ update }) => ({
      increment: () => update((value) => value + 1),
    })),
);

const { injectCounterConsumer, provideCounterConsumer } = craftService(
  { name: 'CounterConsumer', scope: 'toProvide' },
  function* () {
    const counter = yield* CounterToYield();

    return {
      read: () => counter(),
      increment: () => counter.increment(),
    };
  },
);

const { sut, mocks } = setupCraftServiceTestingByRegister(
  injectCounterConsumer,
  {
    CounterConsumer: provideCounterConsumer(),
    Counter: {
      $self: vi.fn(() => 41),
      increment: vi.fn(),
    },
  },
);

expect(sut.read()).toBe(41);
sut.increment();
expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
```

## Register Semantics

### `'real'`

Use `'real'` for reachable non-provider scopes such as `global` or `function`.

```typescript
setupCraftServiceTestingByRegister(injectCounterConsumer, {
  CounterConsumer: provideCounterConsumer(),
  Counter: 'real',
});
```

### Raw provider

Use the provider returned by `provideX(...)` for `toProvide` or `manuallyProvidedAtRoot` services.

```typescript
setupCraftServiceTestingByRegister(injectRootCounter, {
  RootCounter: provideRootCounter(),
  ParentCounter: provideParentCounter(),
  ChildCounter: provideChildCounter(),
});
```

### Raw mock object

Use a plain object when you want to override the public service shape.

```typescript
setupCraftServiceTestingByRegister(injectCounterConsumer, {
  CounterConsumer: provideCounterConsumer(),
  Counter: {
    $self: vi.fn(() => 12),
    increment: vi.fn(),
  },
});
```

### `'notReached'`

Use `'notReached'` only when the service is on a branch fully pruned by an ancestor mock.

```typescript
setupCraftServiceTestingByRegister(injectRootCounter, {
  RootCounter: provideRootCounter(),
  ParentCounter: {
    incrementParent: vi.fn(),
  },
  ChildCounter: 'notReached',
});
```

## Return Value

The function returns:

- `sut`: the resolved service under test
- `mocks`: only the services that were actually mocked in the register

Entries marked as `'real'`, `'notReached'`, or provided through raw providers are not exposed in `mocks`.

## Extra Angular Providers

When the graph depends on real Angular infrastructure, append providers through the third argument.

```typescript
const { sut } = setupCraftServiceTestingByRegister(injectNavigation, register, {
  providers: [provideRouter([])],
});
```

## Alias

`setupTestingService` is a backward-compatible alias of `setupCraftServiceTestingByRegister`.

## See Also

- [craftService](/store/craft-service)
