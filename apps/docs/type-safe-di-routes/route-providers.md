# Route Providers

Build route-level Angular providers from a route's **own auto-provisioned tokens** — path params,
`data`, `queryParams`, and `canActivate` guarded data — with full, type-safe dependency tracking.

## The problem

A `craftRoutes` route auto-provisions route-scoped services. For a route `query/:userId` in the
`demo` collection, `craftRoutes` generates helpers such as `injectDemoUserIdParams` and the
yieldable `DemoQueryUserIdGuardedData`.

The params helper is useful **inside a component**. Guarded data is consumed from a generator with
`yield* DemoQueryUserIdGuardedData()`. Route `data` is intentionally not exported as a collection-level
`inject…Data` helper; inside `withProviders`, consume it through the local `Data` generator. This
also lets you take the value resolved by `canActivate` and feed it into a provider that the routed
component injects.

## The solution: `craftRoute(...).withProviders(...)`

`craftRoute(path, definition)` authors a single route and returns a builder with a `.withProviders(...)`
method. The callback receives **route-scoped service generators**, one per auto-provisioned token
that exists on the route, and returns a normal Angular providers array.

```ts
import {
  abstract,
  craftRoutes,
  craftService,
  query,
  craftRoute,
} from '@craft-ng/core';

type User = { name: string };

// 1. An abstract contract — implemented per route.
const { UserRequirement, provideUser } = craftService(
  { name: 'User', scope: 'abstract' },
  abstract<User>(),
);

// 2. A guard that resolves the user.
const { Auth } = craftService({ name: 'Auth', scope: 'global' }, function* () {
  const { auth } = yield* query('auth', {
    params: () => true,
    loader: async () => ({}) as User,
  });
  return auth;
});

export const { demoRoutes } = craftRoutes('demo', [
  craftRoute('query/:userId', {
    componentDeps: {} as import('./query').GenDeps_GlobalQuery,
    loadComponent: ({ withRetry }) => withRetry(import('./query')),
    canActivate: function* () {
      const user = yield* Auth();
      const safeUser = user.safeValue();
      if (!safeUser) {
        return false;
      }
      return safeUser; // becomes the route's guarded data
    },
  }).withProviders(({ GuardedData }) => [
    provideUser(function* () {
      const guarded = yield* GuardedData(); // Signal<User>
      return guarded();
    }),
  ]),
]);
```

The routed component can now yield `User()` from its Craft component factory and receive the value
that the guard resolved — without ever touching the fully-qualified route helper.

## The helpers object

The `.withProviders(...)` callback receives an object with **route-local short names** for every
auto-provisioned token present on the route:

| Helper          | Present when…               | Yields                                 |
| --------------- | --------------------------- | -------------------------------------- |
| `GuardedData`   | the route has `canActivate` | `Signal<GuardData>`                    |
| `<Param>Params` | per path param              | `Signal<string>` (e.g. `UserIdParams`) |
| `QueryParams`   | the route has `queryParams` | the query-params state                 |
| `Data`          | the route has `data`        | `Signal<RouteData>`                    |

Names are **scoped to the single route**, so the collection prefix and route path are dropped:
`GuardedData`, not `DemoQueryUserIdGuardedData`. The path-param name is kept to keep
multiple params distinct (`UserIdParams`, `TeamIdParams`, …).

Each helper is a generator you consume with `yield*`, exactly like a service's `X()`:

```ts
.withProviders(({ UserIdParams, QueryParams }) => [
  provideSomething(function* () {
    const userId = yield* UserIdParams();   // Signal<string>
    const qp = yield* QueryParams();        // query-params state
    return { userId, qp };
  }),
])
```

## Pairing with an abstract service

`craftRoute(...).withProviders(...)` shines with `scope: 'abstract'` services. The abstract service
declares a contract; each route provides a concrete implementation derived from that route's data.

Abstract services now expose a `provideX(factory)` helper that takes a **generator factory**, tracks
everything it yields, and binds the result to the requirement token. See
[craftService → Abstract Providers](/store/craft-service#abstract-providers).

```ts
const { User, provideUser } = craftService(
  { name: 'User', scope: 'abstract' },
  abstract<User>(),
);

// In a route:
.withProviders(({ GuardedData }) => [
  provideUser(function* () {
    return (yield* GuardedData())();
  }),
])

// In the routed component factory:
const user = yield* User(); // User
```

## Dependency tracking & cascade DI

Everything yielded inside a `withProviders` factory is tracked at the type level and folded into the
route's dependency graph used by [`ValidateCascadeRoutesFile`](/type-safe-di-routes/setup):

- The route's **auto-provisioned** tokens (guarded data, params, query params, data) are recognized
  as provided by the route itself — yielding them is always valid.
- Any **other** service yielded inside the factory that is not provided by the route or the app
  surfaces as a missing-provider error, e.g.:

  ```
  The SomeService service is not provided in path: "query/:userId"
  ```

- The provider's own name (`User` above) is registered as **self-provided**, so a component on that
  route can depend on it without a separate provider declaration.

This means the pattern is safe by construction: you cannot wire a route provider against data the
route does not actually expose.

## Plain providers still work

`.withProviders(...)` is additive. A route can still declare a plain Angular `providers` array, and
both are merged (auto-provisioned services first, then `providers`, then the `withProviders`
factory output):

```ts
craftRoute('admin', {
  componentDeps: {} as import('./admin').GenDeps_Admin,
  loadComponent: ({ withRetry }) => withRetry(import('./admin')),
  providers: [SomeAngularProvider], // plain array, untyped helpers
}).withProviders(({ Data }) => [
  /* factory-built providers with tracking */
]);
```

Under the hood the builder stores the factory on a dedicated `providersFn` field, kept separate from
Angular's `providers` array.

## See Also

- [Setup](/type-safe-di-routes/setup) — the app-wide cascade DI check
- [craftService](/store/craft-service) — `abstract` scope, `provideX`, requirements
