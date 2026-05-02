# onAppStart

Registers startup work inside a generator-based `craftService`.

## Import

```typescript
import { onAppStart } from '@craft-ng/core';
```

## Overview

`onAppStart(...)` is used inside a `craftService(..., function* () {})` generator to declare logic that should run when the application starts.

Important constraints:

- the owning service must be declared with `appStart: true`
- a service can declare `yield* onAppStart(...)` only once
- the callback can be a plain function or a generator function
- nested `onAppStart(...)` calls inside the callback are not supported

`craftAppConfig(...)` runs registered app-start services during Angular application initialization.

## Signature

```typescript
function onAppStart(
  run: () => Observable<unknown> | Promise<unknown> | void,
): Generator<unknown, void, unknown>;

function onAppStart<Yielded>(
  run: () => Generator<
    Yielded,
    Observable<unknown> | Promise<unknown> | void,
    unknown
  >,
): Generator<unknown, void, unknown>;
```

## Plain Callback

Use a plain callback when startup logic does not need to `yield*` crafted dependencies.

```typescript
import { craftService, onAppStart } from '@craft-ng/core';

export const { injectStartupFlag } = craftService(
  {
    name: 'StartupFlag',
    scope: 'global',
    appStart: true,
  },
  function* () {
    yield* onAppStart(() => {
      console.log('app started');
      return Promise.resolve();
    });

    return true;
  },
);
```

## Generator Callback

Use a generator callback when startup logic needs to `yield*` crafted dependencies.

```typescript
import { Console, craftService, onAppStart } from '@craft-ng/core';

export const { injectAppStartLog } = craftService(
  {
    name: 'AppStartLog',
    scope: 'toProvide',
    appStart: true,
  },
  function* () {
    yield* onAppStart(function* () {
      yield* Console.log('This is a log from the appStart callback');
      return new Promise((resolve) => setTimeout(resolve, 1000));
    });

    return 1;
  },
);
```

The callback generator supports the same dependency-yield semantics as a normal crafted generator for:

- `yield* XToYield(...)`
- `yield*` exposure tokens returned by derivation callbacks
- browser boundaries such as `yield* Console.log(...)`

Dependencies used only inside this callback are merged into the parent service dependency graph.

## Dependency Tracking

Generator callbacks are type-visible.

If the callback only uses `Console`, the owning service dependency graph includes `ConsoleService` as a normal dependency node, with `browserBoundary: true`.

This means startup-only dependencies are still visible to:

- `GetInjectedServiceDependencies<typeof injectX>`
- route/app DI checks built on top of service metadata
- test helpers that inspect crafted dependency graphs

## Runtime Behavior

`onAppStart(...)` does not run when the service instance is created.

It registers a startup hook that is executed when the application initializer runs that service, typically through `craftAppConfig(...)`.

If the callback returns:

- `void`: startup continues immediately
- `Promise`: startup waits for the promise to resolve
- `Observable`: startup waits through Angular's initializer handling

Generator callbacks preserve the same waiting behavior. The generator itself resolves first, then its returned `Promise` / `Observable` / `void` is used as the startup result.

## Common Errors

### Missing `appStart: true`

```typescript
yield* onAppStart(() => undefined);
```

This throws at runtime if the owning service was not declared with `appStart: true`.

### Nested `onAppStart(...)`

```typescript
yield* onAppStart(function* () {
  yield* onAppStart(() => undefined); // unsupported
  return undefined;
});
```

Nested declarations are rejected at runtime.

## See Also

- [`craftService`](/store/craft-service)
- [`Browser Boundaries`](/type-safe-di-routes/browser-boundaries)
