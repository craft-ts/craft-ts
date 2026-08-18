# Lazy services

`craftLazy(load)` code-splits a **service**, the way `loadComponent` code-splits a
component — and reuses the same retry and cache-busting engine.

**Use it when** an expensive dependency is only needed on some paths: a PDF
renderer, a chart library, an admin-only API client.
**Not for** a service every route needs — the extra round-trip buys nothing.

`craftLazy(load)` lazily imports a module **on demand** from inside an async craft driver — an
[`asyncProcess`](/guide/state/async-process) loader, or a route guard/resolver — reusing the
exact same retry + cache-busting engine as route lazy loading
([`loadComponent` / `loadChildren`](/guide/routing/route-load-errors)).

Use it when you want to code-split a **service function** (an exported `craftGen`, an API helper, a
heavy computation) and only fetch its chunk when it is actually needed, while keeping Craft's
`status` / `exception` / `reload` semantics.

## Why not a manual dynamic import?

The reflex is to reach for a manual `import()` and inject/call the result imperatively
(an `injectAsync`-style helper):

```ts
// ❌ manual: no status, no typed exceptions, no retry, not reactive
async function runSearch(q: string) {
  const { search } = await import('./search'); // may throw on a stale chunk
  return search(q); // exceptions are untyped, failures are unhandled
}
```

`craftLazy` replaces that with a first-class craft program:

| Concern                              | Manual `import()`      | `craftLazy`                                              |
| ------------------------------------ | ---------------------- | -------------------------------------------------------- |
| Loading / resolved / exception state | you wire it by hand    | inherited from the enclosing `asyncProcess` (`status()`) |
| Stale-chunk retry after a redeploy   | none                   | shared `withRetry` cache-busting engine                  |
| Import failure                       | an unhandled rejection | a typed `CRAFT_LAZY_LOAD_ERROR` exception                |
| The module's own business exceptions | erased to `any`        | preserved and propagated through the type system         |
| Recovery                             | manual `try/catch`     | `.pipe(catchTag(...))` or route `handleExceptions`       |

## Signature

```ts
craftLazy<T>(load: (helpers: CraftLazyLoadHelpers) => Promise<T>): CraftGenInvocation<never, T | CraftLazyLoadError>;

interface CraftLazyLoadHelpers {
  // Wrap the dynamic import so a chunk whose hashed URL went stale after a
  // redeploy is re-fetched with a cache-busting query param.
  withRetry<T>(moduleImport: Promise<T>): Promise<T>;
}
```

- `craftLazy(...)` is a [`craftGen`](/guide/concepts/generators) program: `yield*`-composable and
  [`.pipe(...)`](/guide/advanced/program-operators)-able.
- Its resolved value is the module `T`, **untouched** — the module's exported `craftGen`s keep their
  own exception unions.
- On a final import failure it returns a `CraftLazyLoadError` (`code: 'CRAFT_LAZY_LOAD_ERROR'`),
  which `craftGen` surfaces as a short-circuit → the enclosing resource's `status()` becomes
  `'exception'`.

::: warning It must run in an async driver
`craftLazy` awaits its import through the async program pump, so it can only be `yield*`-ed from an
**`asyncProcess` loader** or a **route guard/resolver**. It cannot be used inside a synchronous
[`craftMethod`](/guide/reactivity/craft-method) (that driver throws on an await request). A `craftMethod`
may only _trigger_ the enclosing `asyncProcess`.
:::

## With `asyncProcess`

The module to split — an exported `craftGen`:

```ts
// search.ts (its own chunk)
import { craftGen } from '@craft-ts/core';
import { SearchApi } from './search-api';

export const search = craftGen(function* (q: string) {
  const api = yield* SearchApi();
  return yield* api.search(q); // may raise E1 | E2
});
```

Load it from an `asyncProcess` loader. The simplest form triggers on demand with the generated
`method`:

```ts
import { asyncProcess, craftLazy } from '@craft-ts/core';

const searchModule = yield* asyncProcess('searchModule', {
  method: () => undefined, // call searchModule.method() to start loading
  loader: function* () {
    return yield* craftLazy(({ withRetry }) => withRetry(import('./search')));
  },
});
```

`searchModule.status()` walks `idle → loading → resolved` (or `exception`), exactly like any other
`asyncProcess`, so the template can drive the UI:

```html
@switch (searchModule.status()) { @case ('loading') { <spinner /> } @case
('exception') { <button (click)="searchModule.reload()">Réessayer</button> } }
```

To **prefetch** as soon as some event fires (the reactive equivalent of an eager
`injectAsync`), bind the process to a source instead of a `method`:

```ts
import { asyncProcess, craftLazy, on$ } from '@craft-ts/core';

const searchModule = yield* asyncProcess('searchModule', {
  // load at the first emission of the source (e.g. on focus of the search box)
  method: on$(searchFocused$, () => undefined),
  loader: function* () {
    return yield* craftLazy(({ withRetry }) => withRetry(import('./search')));
  },
});
```

### Load once, use many

The canonical pattern: one `asyncProcess` owns the module, a second one awaits it with
[`craftUntilSettled`](/guide/routing/guards) and calls the loaded function. Wrapping both in a
[`craftService`](/guide/app/craft-service) exposes a clean API:

```typescript
import {
  asyncProcess,
  craftLazy,
  craftService,
  craftUntilSettled,
  on$,
} from '@craft-ts/core';

const { Search } = craftService({ name: 'Search', scope: 'component' }, () => {
  // prefetch the module at the first emission of the source
  const searchModule = yield* asyncProcess('searchModule', {
    method: on$(searchFocused$, () => undefined),
    loader: function* () {
      return yield* craftLazy(({ withRetry }) =>
        withRetry(import('./search')),
      );
    },
  });

  // run a search on a user action — triggerSearch(q) sets the params
  const searchResult = yield* asyncProcess('searchResult', {
    method: (q: string) => q,
    loader: function* ({ params: q }) {
      const { search } = yield* craftUntilSettled(searchModule); // wait for the chunk
      return yield* search(q);
    },
  });

  return { searchModule, searchResult };
});
```



Exception propagation is fully typed, with **no** manual plumbing:

- `craftLazy` may add `CRAFT_LAZY_LOAD_ERROR`;
- `craftUntilSettled(searchModule)` relays it to `searchResult`;
- `search(q)` relays its own `E1 | E2`.

So `searchResult.exception()?.code` is exactly `'CRAFT_LAZY_LOAD_ERROR' | 'E1' | 'E2'`, and
`searchResult.value()` keeps the return type of `search`.

## In routes

Guards and resolvers are async drivers too, so you can `yield* craftLazy(...)` directly inside them.
A failed import surfaces as `CRAFT_LAZY_LOAD_ERROR` and flows into the route's
[exception handlers](/guide/concepts/exceptions), exactly like any other guard/resolver exception:

```ts
craftRoute(
  'search',
  {
    resolve: craftResolve(function* () {
      const { search } = yield* craftLazy(({ withRetry }) =>
        withRetry(import('./search')),
      );
      return yield* search('*');
    }),
  },
  {
    CRAFT_LAZY_LOAD_ERROR: craftExceptionHandler(function* ({ redirectTo }) {
      return yield* redirectTo({ to: 'offline' });
    }),
    E1: craftExceptionHandler(function* () {
      return [] as Result[];
    }),
    // E2 left unhandled → surfaces as a route exception
  },
);
```

This is the code-splitting counterpart of a lazy `loadComponent`: instead of splitting the
_component_, you split the _data-loading logic_ it depends on, with the same retry + error screen
guarantees as [Route Load Errors](/guide/routing/route-load-errors).

## Handling the load error

`CRAFT_LAZY_LOAD_ERROR` is an ordinary craft exception, so all the usual tools apply.

**Catch it at the source** (fall back to another module or a default), which removes it from the
exception union:

```ts
loader: function* () {
  return yield* craftLazy(({ withRetry }) => withRetry(import('./search'))).pipe(
    catchTag('CRAFT_LAZY_LOAD_ERROR', function* () {
      return yield* craftLazy(({ withRetry }) => withRetry(import('./search-fallback')));
    }),
  );
}
```

**Catch a business exception of the loaded function** — `search(q)` is itself a pipeable `craftGen`:

```ts
loader: function* ({ params: q }) {
  const { search } = yield* craftUntilSettled(searchModule);
  return yield* search(q).pipe(
    catchTag('E1', function* () { return [] as Result[]; }),
    // E2 stays in searchResult.exceptions()
  );
}
```

**Read it reactively** — anything left uncaught keeps `status()` at `'exception'` and shows up in
`exceptions()` / `hasException()`, ready to render in the template.

See [Program Operators](/guide/advanced/program-operators) for `catchTag` / `catchTag.exhaustive`.

## Retry & cache-busting

`withRetry(import(...))` is what makes a stale chunk recover after a redeploy: on failure the chunk
URL is re-fetched with a cache-busting query param. The attempt/back-off policy is injectable and
defaults to the shared craft loader retry (one retry, 250 ms):

```ts
import { provideCraftLazyLoadRetry } from '@craft-ts/core';

providers: [
  provideCraftLazyLoadRetry({
    attempts: 2,
    delayMs: (error, ctx) => 250 * ctx.attempt,
    shouldRetry: (error) => isRecoverable(error),
  }),
];
```

The dynamic `import(url)` used for cache-busting is itself overridable through `CRAFT_DYNAMIC_IMPORT`
(useful in tests). This is the very same engine as [route load retry](/guide/routing/route-load-errors), so a
`craftLazy` import and a lazy route load behave identically under a bad deployment.

## API

| Export                                                        | Purpose                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `craftLazy(load)`                                             | Lazily import a module from an async craft driver.               |
| `CraftLazyLoadHelpers`                                        | The `{ withRetry }` helpers passed to `load`.                    |
| `CraftLazyLoadError` / `CRAFT_LAZY_LOAD_ERROR_CODE`           | The exception (and its code) returned on a final import failure. |
| `provideCraftLazyLoadRetry(config)` / `CRAFT_LAZY_LOAD_RETRY` | Configure the `craftLazy` retry policy.                          |
| `CRAFT_DYNAMIC_IMPORT`                                        | Override the dynamic `import(url)` (cache-busting / tests).      |

## See Also

- [craftService](/guide/app/craft-service)
- [asyncProcess](/guide/state/async-process) — the usual driver for `craftLazy`
- [Route load errors](/guide/routing/route-load-errors) — the same retry engine
