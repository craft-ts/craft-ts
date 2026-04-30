# Browser Boundaries

> [!WARNING]
> Upcoming / draft API. This page documents the planned browser DSL surface for `@craft-ng/core`. The exports shown below are not shipped yet.

Browser boundaries are intended to keep direct browser access out of your `craftService` implementations.

Instead of reaching for globals such as `console`, `localStorage`, `location`, or `history` inside a service, the idea is to route those interactions through typed helpers that can be tracked as explicit browser dependencies.

## Planned Import

The intended public import shape is:

```typescript
import {
  BrowserCrypto,
  BrowserDocument,
  BrowserHistory,
  BrowserLocation,
  BrowserNavigator,
  BrowserPerformance,
  BrowserWindow,
  Console,
  Cookies,
  LocalStorage,
  SessionStorage,
} from '@craft-ng/core';
```

This import is shown here as a target API, not as a currently available export list.

## Motivation

Direct browser access inside a service makes dependencies harder to see, harder to test, and easier to spread across unrelated business logic.

The planned browser DSL has two goals:

- keep browser interactions explicit inside generator-based services
- route those interactions through `yield* X.method(...)` helpers instead of raw globals

Internally, each boundary is expected to sit on a global service marked with `browserBoundary: true`. That keeps the dependency graph able to distinguish application logic from browser-host interactions.

## Mental Model

These APIs are intended to be a DSL, not a public proxy over raw browser objects.

- You use them inside generator-based `craftService(...)` or `toCraftService(...)` implementations.
- The public surface is method-oriented, including reads, so the usage stays uniform with `yield*`.
- The underlying implementation is expected to be backed by internal global services flagged as browser boundaries.

That means the usage should feel like this:

```typescript
import { craftService } from '@craft-ng/core';

const { injectAuditTrail } = craftService(
  { name: 'AuditTrail', scope: 'global' },
  function* () {
    yield* Console.log('audit service created');

    return {
      trackUserAction: function* (action: string) {
        yield* Console.info('user action', action);
      },
    };
  },
);
```

## Core Examples

### Console

```typescript
yield* Console.log('my service run');
yield* Console.error('unexpected failure', error);
```

### Local Storage

```typescript
yield* LocalStorage.setItem('token', token);

const persistedToken = yield* LocalStorage.getItem('token');
```

### Cookies

```typescript
yield* Cookies.set('session', sessionId, {
  path: '/',
  sameSite: 'strict',
});

const session = yield* Cookies.get('session');
```

### Location

```typescript
const href = yield* BrowserLocation.href();

yield* BrowserLocation.reload();
```

### History

```typescript
yield* BrowserHistory.back();
```

## Planned API Reference

### `Console`

Planned methods:

- `debug`
- `info`
- `log`
- `warn`
- `error`
- `trace`
- `group`
- `groupCollapsed`
- `groupEnd`
- `time`
- `timeEnd`

### `LocalStorage`

Planned methods:

- `getItem`
- `setItem`
- `removeItem`
- `clear`
- `key`
- `length`

### `SessionStorage`

Planned methods:

- `getItem`
- `setItem`
- `removeItem`
- `clear`
- `key`
- `length`

### `Cookies`

Planned methods:

- `get`
- `getAll`
- `set`
- `remove`
- `has`

### `BrowserLocation`

Planned methods:

- `href`
- `origin`
- `protocol`
- `host`
- `hostname`
- `port`
- `pathname`
- `search`
- `hash`
- `assign`
- `replace`
- `reload`

### `BrowserHistory`

Planned methods:

- `length`
- `state`
- `back`
- `forward`
- `go`
- `pushState`
- `replaceState`

### `BrowserNavigator`

Planned methods:

- `userAgent`
- `language`
- `languages`
- `onLine`
- `cookieEnabled`
- `sendBeacon`

### `BrowserPerformance`

Planned methods:

- `now`
- `mark`
- `measure`
- `clearMarks`
- `clearMeasures`

### `BrowserCrypto`

Planned methods:

- `randomUUID`
- `getRandomValues`
- `digest`

### `BrowserDocument`

Minimal planned surface:

- `title`
- `setTitle`
- `visibilityState`
- `hasFocus`

### `BrowserWindow`

Minimal planned surface:

- `innerWidth`
- `innerHeight`
- `scrollX`
- `scrollY`
- `scrollTo`

## Related Adapter: `CraftHttpClient`

Unlike `Console`, `LocalStorage`, or `BrowserLocation`, Angular's `HttpClient` is already a DI-managed Angular dependency. It is better understood as a typed service adapter built on top of [`toCraftService`](/store/to-craft-service), not as a browser-host global.

`CraftHttpClient` is designed to avoid colliding with Angular's own `HttpClient` import from `@angular/common/http`.

Its contract is intentionally different from the browser DSLs:

- it is not treated as `browserBoundary: true`
- it requires an explicit success type
- it returns a promise of `Success | craftException({ code: 'HttpError' })`

Usage looks like this:

```typescript
const getUsers = yield* CraftHttpClient.get<User[]>();
const createUser = yield* CraftHttpClient.post<User>();

const users = await getUsers('/api/users');
const createdUser = await createUser('/api/users', payload);
```

This shape is intended to work naturally with `query`, `mutation`, and other async service APIs that already understand `craftException` results.

## Design Constraints

The planned v1 surface is intentionally narrow.

- Reads are exposed as methods so the API stays uniform with `yield*`.
- Raw `window`, `document`, and DOM nodes are not intended to be public browser DSL outputs.
- `BrowserDocument` and `BrowserWindow` should stay minimal rather than becoming generic escape hatches back to browser globals.

This is especially important for DOM access. A broad `document` wrapper would quickly reintroduce the same direct browser interactions the boundary is trying to avoid.

## Relationship With `craftService` And `toCraftService`

These browser DSLs are intended to be built internally on top of the same service composition primitives used elsewhere in the library.

- [`craftService`](/store/craft-service) provides the generator-based composition model.
- [`toCraftService`](/store/to-craft-service) is the natural fit for adapting host objects and browser-backed dependencies into craft-compatible services.

In other words, the public browser DSL is expected to be ergonomic, while the internal implementation still benefits from explicit service boundaries, typed dependency tracking, and `browserBoundary: true`.

## See Also

- [`craftService`](/store/craft-service)
- [`toCraftService`](/store/to-craft-service)
