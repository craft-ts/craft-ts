# setupCraftServiceTestingByRegister

Sets up a `craftService` or `toCraftService` from an explicit flat register derived from the full dependency graph.

## Import

```typescript
import {
  setupCraftComponentTestingByRegister,
  setupCraftServiceTestingByRegister,
} from '@craft-ng/core';
```

## Introduction

`setupCraftServiceTestingByRegister` is the exhaustive testing utility for the `craftService` graph.

Instead of providing only the overrides you care about, you provide a full typed register where each service is marked as:

- real
- provided by its raw `provideX(...)`
- mocked with a raw object
- or pruned with `'notReached'`

This is useful when you want explicit control over every node in the service graph.

For tests that should stay close to reality, use `boundaryOnly`. It keeps the
application graph real by default and only lets you decide the services marked
with `browserBoundary: true`.

## Register Workflow

The intended workflow is:

1. start from the full dependency graph of the SUT
2. fill each key with a real provider, `'real'`, a mock object, or `'notReached'`
3. pass the register to `await setupCraftServiceTestingByRegister(...)`

## Basic Example

```typescript
import {
  craftService,
  setupCraftServiceTestingByRegister,
  state,
} from '@craft-ng/core';
import { vi } from 'vitest';

const { Counter } = craftService(
  { name: 'Counter', scope: 'global' },
  () =>
    state(10, ({ update }) => ({
      increment: () => update((value) => value + 1),
    })),
);

const { CounterConsumer, provideCounterConsumer } = craftService(
  { name: 'CounterConsumer', scope: 'toProvide' },
  function* () {
    const counter = yield* Counter();

    return {
      read: () => counter(),
      increment: () => counter.increment(),
    };
  },
);

const { sut, mocks } = await setupCraftServiceTestingByRegister(
  CounterConsumer,
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
await setupCraftServiceTestingByRegister(CounterConsumer, {
  CounterConsumer: provideCounterConsumer(),
  Counter: 'real',
});
```

### Raw provider

Use the provider returned by `provideX(...)` for `toProvide` or `manuallyProvidedAtRoot` services.

```typescript
await setupCraftServiceTestingByRegister(RootCounter, {
  RootCounter: provideRootCounter(),
  ParentCounter: provideParentCounter(),
  ChildCounter: provideChildCounter(),
});
```

### Raw mock object

Use a plain object when you want to override the public service shape.

```typescript
await setupCraftServiceTestingByRegister(CounterConsumer, {
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
await setupCraftServiceTestingByRegister(RootCounter, {
  RootCounter: provideRootCounter(),
  ParentCounter: {
    incrementParent: vi.fn(),
  },
  ChildCounter: 'notReached',
});
```

## Return Value

The function resolves to:

- `sut`: the resolved service under test
- `mocks`: only the services that were actually mocked in the register

Entries marked as `'real'`, `'notReached'`, or provided through raw providers are not exposed in `mocks`.

## App Start Hooks

Reachable real services declared with `appStart: true` must be acknowledged explicitly.

```typescript
const { sut } = await setupCraftServiceTestingByRegister(
  Dashboard,
  {
    Dashboard: provideDashboard(),
    AuthSession: 'real',
    Analytics: 'real',
  },
  {
    appStart: {
      AuthSession: 'run',
      Analytics: 'ignore',
    },
  },
);
```

`'run'` injects the real service and awaits its `onAppStart(...)` hook. `'ignore'` documents that the test intentionally skips it. Mocked services and `'notReached'` branches do not require `appStart` entries.

## Boundary-Only Mode

`setupCraftServiceTestingByRegister.boundaryOnly(...)` is the recommended mode
when the test should mock only browser or platform edges.

```typescript
const { sut, mocks } = await setupCraftServiceTestingByRegister.boundaryOnly(
  Dashboard,
  {
    toProvideRegister: {
      Dashboard: provideDashboard(),
      FeatureConfig: provideFeatureConfig({ env: 'test' }),
    },
    boundaryRegister: {
      LocalStorageService: {
        getItem: vi.fn(() => 'cached'),
      },
      ConsoleService: 'real',
    },
    appStart: {
      AuthSession: 'run',
    },
  },
);
```

- `toProvideRegister` contains real providers required by reachable services.
- `boundaryRegister` contains the explicit decision for each reachable browser boundary.
- non-boundary services cannot be mocked in this mode.
- descendants of a mocked boundary are pruned and do not need entries.

The component helper exposes the same mode:

```typescript
const { fixture, component, mocks } =
  await setupCraftComponentTestingByRegister.boundaryOnly(
    DashboardPage,
    {} as GenDeps_DashboardPage,
    {
      boundaryRegister: {
        BrowserWindowService: 'real',
        LocalStorageService: {
          getItem: vi.fn(() => 'cached'),
        },
      },
      inputs: {
        userId: '42',
      },
    },
  );
```

The helper never decides automatically from `jsdom` or another test
environment. Use `'real'` when the real boundary is appropriate, and provide a
mock when the test needs deterministic platform behavior.

## Extra Angular Providers

When the graph depends on real Angular infrastructure, append providers through the third argument.

```typescript
const { sut } = await setupCraftServiceTestingByRegister(
  Navigation,
  register,
  {
    providers: [provideRouter([])],
  },
);
```

## Alias

`setupTestingService` is a backward-compatible alias of `setupCraftServiceTestingByRegister`.

## See Also

- [craftService](/store/craft-service)
