# Browser boundaries

A browser boundary is the line between your logic and the outside world:
`localStorage`, `navigator`, `location`, the network. Craft keeps direct access
out of your services while still making each of those dependencies **explicit in
the graph** — so a test can replace exactly them, and nothing else.

**Use them when** a service touches the platform.
**Then test with `boundaryOnly`**: the whole application graph stays real and
only the boundaries are mocked, which is what makes a passing test mean
something.

Browser boundaries keep direct browser access out of your `craftService` implementations while still making those dependencies explicit in the service graph.

Every boundary on this page is backed by a global crafted service marked with `browserBoundary: true`.

::: warning
Some APIs are not documented here yet.
:::

## Import

The main DSL exports are:

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
} from '@craft-ts/core';
```

When you need to derive methods for later reuse, each boundary also exposes the usual generated helpers:

```typescript
import { ConsoleService, CONSOLE_SERVICE_META_DATA } from '@craft-ts/core';
```

The same pattern exists for the other boundaries:

- `LocalStorageService`
- `SessionStorageService`
- `CookiesService`
- `BrowserLocationService`
- `BrowserHistoryService`
- `BrowserNavigatorService`
- `BrowserPerformanceService`
- `BrowserCryptoService`
- `BrowserDocumentService`
- `BrowserWindowService`

## Motivation

Direct browser access inside a service hides dependencies inside business logic and makes tracking harder.

Browser boundaries solve that in two complementary ways:

- use `yield* X.method(...)` when the browser interaction should happen directly inside the generator
- use `XService(...)` when you want to derive bound browser helpers and reuse them inside returned callbacks

## Mental Model

There are two valid ways to use a browser boundary.

### Direct DSL

Use the DSL when the browser interaction belongs to the generator itself.

<<< @/tests/snippets/guide/testing/browser-boundaries/example-3.spec.ts#example-3


### Derived Service Helper

Use `XService(...)` when the browser method needs to stay callable later from a returned method.

<<< @/tests/snippets/guide/testing/browser-boundaries/example-4.spec.ts#example-4


That second form is what preserves derivability while still tracking the browser dependency explicitly.

## Core Examples

### Console

```typescript
yield * Console.log('my service run');
yield * Console.error('unexpected failure', error);
```

### Local Storage

```typescript
yield * LocalStorage.setItem('token', token);

const persistedToken = yield * LocalStorage.getItem('token');
const entryCount = yield * LocalStorage.length();
```

### Session Storage

```typescript
yield * SessionStorage.setItem('active-tab', 'settings');

const tab = yield * SessionStorage.getItem('active-tab');
```

### Cookies

```typescript
yield *
  Cookies.set('session', sessionId, {
    path: '/',
    sameSite: 'strict',
  });

const session = yield * Cookies.get('session');
const hasSession = yield * Cookies.has('session');
```

### Location

```typescript
const href = yield * BrowserLocation.href();
const pathname = yield * BrowserLocation.pathname();

yield * BrowserLocation.reload();
```

### History

```typescript
yield * BrowserHistory.replaceState({ step: 2 }, '', '/checkout?step=2');

const state = yield * BrowserHistory.state();
```

### Document

```typescript
yield * BrowserDocument.setTitle('Checkout');

const title = yield * BrowserDocument.title();
```

### Window

```typescript
const width = yield * BrowserWindow.innerWidth();

yield * BrowserWindow.scrollTo(0, 0);
yield * BrowserWindow.alert('Cache cleared! The page will reload.');

const confirmed =
  yield * BrowserWindow.confirm('Cache cleared! The page will reload.');

if (confirmed) {
  yield * BrowserLocation.reload();
}
```

### Performance And Crypto

```typescript
const now = yield * BrowserPerformance.now();
const uuid = yield * BrowserCrypto.randomUUID();
```

## API Reference

Every service below is:

- `providedIn: 'global'`
- `browserBoundary: true`
- exposed both as a DSL object and as generated service helpers

### `Console` and `ConsoleService`

Methods:

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

Generated helpers:

- `ConsoleService`
- `ConsoleService`
- `CONSOLE_SERVICE_META_DATA`

### `LocalStorage` and `LocalStorageService`

Methods:

- `getItem`
- `setItem`
- `removeItem`
- `clear`
- `key`
- `length`

### `SessionStorage` and `SessionStorageService`

Methods:

- `getItem`
- `setItem`
- `removeItem`
- `clear`
- `key`
- `length`

### `Cookies` and `CookiesService`

Methods:

- `get`
- `getAll`
- `set`
- `remove`
- `has`

### `BrowserLocation` and `BrowserLocationService`

Methods:

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

### `BrowserHistory` and `BrowserHistoryService`

Methods:

- `length`
- `state`
- `back`
- `forward`
- `go`
- `pushState`
- `replaceState`

### `BrowserNavigator` and `BrowserNavigatorService`

Methods:

- `userAgent`
- `language`
- `languages`
- `onLine`
- `cookieEnabled`
- `sendBeacon`

### `BrowserPerformance` and `BrowserPerformanceService`

Methods:

- `now`
- `mark`
- `measure`
- `clearMarks`
- `clearMeasures`

### `BrowserCrypto` and `BrowserCryptoService`

Methods:

- `randomUUID`
- `getRandomValues`
- `digest`

### `BrowserDocument` and `BrowserDocumentService`

Methods:

- `title`
- `setTitle`
- `lang`
- `setLang`
- `dir`
- `setDir`
- `visibilityState`
- `hasFocus`

### `BrowserWindow` and `BrowserWindowService`

Methods:

- `innerWidth`
- `innerHeight`
- `scrollX`
- `scrollY`
- `scrollTo`
- `alert`
- `confirm`

## Related Adapter: `CraftHttpClient`

`CraftHttpClient` is implemented, but it is not a browser boundary.

Unlike `Console`, `LocalStorage`, or `BrowserLocation`, `CraftHttpClient` is a
typed service boundary. It belongs in the dependency graph rather than being
treated as a browser-global.

Its contract is intentionally different:

- it is not treated as `browserBoundary: true`
- it requires `success: response<T>()` inside a declarative builder
- it can declare ordered `exceptions: [function* (...) { ... }]` rules
- it returns a promise of `Success | craftException({ _tag: 'HttpError' })`

Usage looks like this:

```typescript
const getUsers =
  yield *
  CraftHttpClient.get(({ response }) => ({
    url: '/api/users',
    params: { page: 1 },
    success: response<User[]>(),
  }));

const createUser =
  yield *
  CraftHttpClient.post(({ response }) => ({
    url: '/api/users',
    payload,
    success: response<User>(),
  }));

const login =
  yield *
  CraftHttpClient.post(({ response }) => ({
    url: '/api/login',
    payload,
    success: response<{ token: string }>(),
    exceptions: [
      function* ({ status, code, content }) {
        if (!(yield* status(400))) return;
        if (!(yield* code('PASSWORD_REQUIRED'))) return;
        if (!(yield* content('Password is required'))) return;

        return craftException({ _tag: 'PASSWORD_REQUIRED' });
      },
    ],
  }));

const users = await getUsers();
const createdUser = await createUser();
const loginResult = await login();
```

## Design Constraints

The browser boundaries stay intentionally narrow.

- Reads are exposed as methods so the public API stays uniform with `yield*`.
- Raw `window`, `document`, and DOM nodes are not exposed as public outputs.
- `BrowserDocument` and `BrowserWindow` remain minimal rather than becoming generic escape hatches.

This keeps the API focused on explicit browser interactions instead of reintroducing broad direct access to host globals.

## Relationship With `craftService`

Browser boundaries participate in the same dependency tracking model as any other crafted service.

- [`craftService`](/guide/app/craft-service) is what you use to consume them and compose higher-level services.
- Use a small `craftService` adapter for host dependencies that are not part of
  this built-in browser boundary set.

## See Also

- [`craftService`](/guide/app/craft-service)
- [Architecture rules](/guide/testing/architecture) — assert HTTP only crosses a boundary
