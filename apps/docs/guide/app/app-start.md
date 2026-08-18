# App start

`onAppStart` declares work that must run — and finish — before the application
renders, owned by the service that needs it rather than by a global bootstrap
file.

**Use it when** something must be true before the first paint: a loaded config,
a restored session, a feature-flag fetch.
**Not when** the work can happen after render — that is just an effect, and
blocking on it costs your users a blank screen.

## Import

```typescript
import { onAppStart } from '@craft-ts/core';
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

<<< @/tests/snippets/guide/app/app-start/startupflag.spec.ts#startupflag


## Generator Callback

Use a generator callback when startup logic needs to `yield*` crafted dependencies.

```typescript
import { Console, craftService, onAppStart } from '@craft-ts/core';

export const { AppStartLog } = craftService(
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

- `yield* X(...)`
- `yield*` exposure tokens returned by derivation callbacks
- browser boundaries such as `yield* Console.log(...)`

Dependencies used only inside this callback are merged into the parent service dependency graph.

## Registering it with `craftAppConfig`

Declaring `onAppStart` is only half of it — nothing runs until the service is
**registered**. Two steps, and both are mechanical.

Augment the app-start registry so the service is known by name:

```typescript
declare module '@craft-ts/core' {
  interface CraftAppStartRegistry {
    AppStartLog: typeof AppStartLog;
  }
}
```

Then list it in `craftAppConfig`:

```typescript
export const appConfig = craftAppConfig({
  appStart: {
    AppStartLog,
  },
  providers: [
    /* … */
  ],
});
```

`craftAppConfig` runs every registered app-start service during Angular's
application initialization, and the app renders once they have settled.

Here it is end to end:

<<< @/tests/snippets/guide/app/app-start/appconfig.spec.ts#appconfig


::: tip The registry augmentation is generated
The `declare module` block is written for you by the craft-ts ESLint plugin —
you rarely type it by hand.
:::

::: warning A declared hook that is never registered simply never runs
It is not an error: `appStart: true` and `yield* onAppStart(...)` describe the
service, the `appStart` map in `craftAppConfig` is what activates it. If startup
logic silently doesn't happen, check the map first.
:::

## Dependency Tracking

Generator callbacks are type-visible.

If the callback only uses `Console`, the owning service dependency graph includes `ConsoleService` as a normal dependency node, with `browserBoundary: true`.

This means startup-only dependencies are still visible to:

- `GetServiceDependencies<typeof X>`
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
yield * onAppStart(() => undefined);
```

This throws at runtime if the owning service was not declared with `appStart: true`.

### Nested `onAppStart(...)`

```typescript
yield *
  onAppStart(function* () {
    yield* onAppStart(() => undefined); // unsupported
    return undefined;
  });
```

Nested declarations are rejected at runtime.

## See Also

- [`craftService`](/guide/app/craft-service)
- [`Browser Boundaries`](/guide/testing/browser-boundaries)
