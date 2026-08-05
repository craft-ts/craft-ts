# craftService

A service is a factory with a **name** and a **scope** — not a class. It packages
primitives and dependencies behind an explicit API, and keeps the whole
dependency graph visible to the compiler.

**Use it when** logic outgrows a single component field, or when two places need
the same behaviour.
**Not when** you are adapting an existing Angular service or token — that is
[`toCraftService`](/guide/app/integrate-existing).

The contrast with `inject(...)` scattered across classes is the point:
dependencies here are explicit and **type-visible**, which is what the route DI
check and the test registers read.

```typescript
import { craftService } from '@craft-ng/core';
```

::: warning API still moving
This API will be aligned with the others — made yieldable, so `source$` is
tracked as a dependency.
:::

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

## Scoping providers to the service

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

## Composing services

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

## Shaping the public API

`yield* X()` can expose only part of a dependency, and `X.property()` derives a
single one. See **[Shaping a service's public API](/guide/app/expose-api)**.

## Contracts without an implementation

`scope: 'abstract'` declares a contract that a provider must satisfy later. See
**[Abstract services](/guide/app/abstract-services)**.

## Startup work

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

## Pitfalls

**Reaching for `global` by default.** A global service is a singleton for the
whole app, whether or not that was intended. Start at `function` — see
[Service scopes](/guide/app/service-scopes).

**`toProvide` without the provider.** Angular does not report a missing provider
at compile time; the failure appears at runtime. The
[route DI check](/guide/routing/setup) is what closes that hole.

**Returning the whole world.** What a service returns is its API. Return the
narrow thing; consumers that need more can yield more.

**Calling `inject()` inside a craft factory.** It works and it is invisible to
every check that makes this worthwhile. The `craft-ng/no-angular-inject` rule
exists for exactly this.

## See Also

- [Service scopes](/guide/app/service-scopes) — the one decision to make
- [Shaping the public API](/guide/app/expose-api)
- [Testing services](/guide/testing/services)
