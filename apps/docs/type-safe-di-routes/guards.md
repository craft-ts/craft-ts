# Route Guards

Write **reusable, parameterised** route guards, **compose** them in a single `canActivate` /
`canMatch`, and resolve their failure cases **exhaustively** — an unhandled case is a **type error**.

> **Exception handling has moved off the guard.** `craftCanActivate` / `craftCanMatch` now take
> **only the guard** — there is no inline `resolvers` argument. Every reachable `craftException` is
> resolved by a single, exhaustive **[`handleExceptions`](./exception-handling.md)** map on the
> route, applied **after the URL commits** by the non-blocking
> [`CraftRouterOutlet`](./pending-ui.md). Some examples below still show the older inline
> `resolvers` form; see [exception-handling.md](./exception-handling.md) for the current model.

## The problem

A `craftRoutes` `canActivate` accepts a single function (or generator function). To apply several
authorization rules — role, account state, feature flag… — you have to inline everything into one
generator and hand-roll each rejection by returning a `createUrlTree(...)`:

```ts
canActivate: function* () {
  const { user } = yield* CraftAuthToYield(undefined, ({ user }) => ({ user }));
  if (!user()) {
    return createUrlTree(['/auth/login']); // not authenticated
  }
  if (user()!.role !== 'admin') {
    return createUrlTree(['/unauthorized']); // wrong role
  }
  const { pizzeria } = yield* CraftAuthToYield(undefined, ({ pizzeria }) => ({ pizzeria }));
  if (pizzeria()) {
    return createUrlTree(['/dashboard']); // already onboarded
  }
  return true;
}
```

The rules are not reusable, the redirect logic is tangled with the checks, and nothing forces you to
handle every rejection — forget a branch and it silently falls through.

## The solution: `craftGen` + `craftCanActivate`

Split the two concerns:

- **`craftGen`** authors a reusable, parameterised guard. It either returns a success value or a
  typed [`craftException`](#exceptions).
- **`craftCanActivate`** composes guards with `yield*` and takes a `resolvers` map that must cover
  **exactly** the reachable exception codes.

```ts
import {
  craftCanActivate,
  craftException,
  craftGen,
  craftResolve,
  CraftHttpClient,
  query,
  craftRoute,
  untilSettled,
} from '@craft-ng/core';

// Reusable guards — each returns a success value | craftException(...)
const roleGuard = craftGen(
  (...roles: Role[]) =>
    function* () {
      const { user } = yield* CraftAuthToYield(undefined, ({ user }) => ({
        user,
      }));
      if (!user()) return craftException({ code: 'NOT_AUTHENTICATED' });
      return roles.includes(user()!.role)
        ? true
        : craftException({ code: 'FORBIDDEN_ROLE' });
    },
);

const noPizzeriaGuard = craftGen(
  () =>
    function* () {
      const { pizzeria } = yield* CraftAuthToYield(
        undefined,
        ({ pizzeria }) => ({ pizzeria }),
      );
      return pizzeria() ? craftException({ code: 'HAS_PIZZERIA' }) : true;
    },
);

const pizzeriaDraftQuery = query({
  params: () => true,
  loader: function* () {
    return yield* CraftHttpClient.get(({ response }) => ({
      url: '/api/pizzerias/draft',
      success: response<PizzeriaDraft>(),
      exceptions: [
        function* ({ status }) {
          if (!(yield* status(404))) return;
          return craftException({ code: 'PIZZERIA_DRAFT_UNAVAILABLE' });
        },
      ],
    }));
  },
});

craftRoute(
  'new',
  {
    title: 'Create Pizzeria',
    canActivate: craftCanActivate(function* () {
      yield* roleGuard(ROLES.PIZZERIA_ADMIN); // short-circuits on exception
      yield* noPizzeriaGuard();
      return true;
    }),
    resolve: craftResolve(function* () {
      return yield* untilSettled(pizzeriaDraftQuery);
    }),
    loadComponent: () =>
      import('./pages/admin-pizzeria-form-page/admin-pizzeria-form-page').then(
        (m) => m.AdminPizzeriaFormPage,
      ),
    componentDeps:
      {} as import('./pages/admin-pizzeria-form-page/admin-pizzeria-form-page').GenDeps_AdminPizzeriaFormPage,
  },
  {
    // Resolved centrally — exhaustive over canActivate ∪ canMatch ∪ resolve.
    NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectTo }) {
      return yield* redirectTo({ to: 'auth/login' });
    }),
    FORBIDDEN_ROLE: craftExceptionHandler(function* ({ redirectTo }) {
      return yield* redirectTo({ to: 'unauthorized' });
    }),
    HAS_PIZZERIA: craftExceptionHandler(function* ({ redirectTo }) {
      return yield* redirectTo({ to: 'pizzerias/admin' });
    }),
    PIZZERIA_DRAFT_UNAVAILABLE: craftExceptionHandler(function* ({
      globalError,
    }) {
      return globalError();
    }),
    HttpError: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
  },
);

// After the collection is defined, assert every route handles exactly its codes:
//   assertExhaustiveRouteExceptions(adminRoutes);
```

## Reactive guards

While a route is active, its `canActivate` invariant stays **under observation** (live guards, on by
default). If a signal the guard reads changes — e.g. the user logs out and `Auth` becomes `null` —
the guard re-evaluates synchronously and applies [`handleExceptions`](./exception-handling.md) with
`phase: 'active'`, so the target is never left rendered in an incoherent state. The reactive phase
never re-runs `resolve` (no new pending). Opt out per route with `reactiveGuards: false`.

## How composition works

`craftGen(factory)` returns a factory you invoke and delegate to with `yield*`:

- The guard's **dependency yields** (`CraftAuthToYield`, `CraftRouterToYield`, …) flow up to the
  route exactly as in a plain generator guard, so [cascade DI tracking](/type-safe-di-routes/setup)
  still sees them.
- As soon as a composed guard produces a `craftException`, the enclosing generator
  **short-circuits**: `yield* roleGuard(...)` interrupts the whole `function*`, and the exception is
  propagated to the `craftCanActivate` boundary — no `if`/`return` plumbing in the composing guard.
- The set of exceptions each guard can produce is tracked **at the type level**, so
  `craftCanActivate` knows precisely which codes its `resolvers` must handle.

Order matters: guards run top-to-bottom and the first exception wins (fail-fast).

## The handler context

Each route exception handler receives the typed exception and payload, the navigation phase, the
native Angular `Router` helpers, and the five outcome constructors. See
[Centralised Exception Handling](./exception-handling.md#handler-context) for the exhaustive list
and examples.

Use `redirectTo(...)` for typed internal routes:

```ts
{
  RATE_LIMITED: craftExceptionHandler(function* ({ payload, redirectTo }) {
    return yield* redirectTo({
      to: 'cooldown',
      queryParams: { retryAfter: String(payload.retryAfter) },
    });
  }),
}
```

A handler returns a `CraftExceptionOutcome` via `redirectTo`, `redirectUrl`, `renderComponent`,
`globalError`, `stay`, or `noop`. The `payload` is taken from `craftException({ code }, payload)`'s second argument
and typed per code.

## Handlers can yield services

A handler may be a **generator** that `yield*`s craft services before building the redirect — for
example to read the login URL from a config service. Those yields are tracked exactly like the
guards' own dependencies, so a service used only at redirect-time still flows into the route's
[cascade DI](/type-safe-di-routes/setup) (yield an unprovided service and it surfaces as a
missing-provider error on the route):

```ts
craftRoute(
  'admin',
  {
    canActivate: craftCanActivate(function* () {
      yield* roleGuard(ROLES.ADMIN);
      return true;
    }),
  },
  {
    // Generator handler — `RedirectConfig` becomes a tracked route dependency.
    FORBIDDEN_ROLE: craftExceptionHandler(function* ({ redirectUrl }) {
      const { unauthorizedUrl } = yield* RedirectConfigToYield();
      return redirectUrl(unauthorizedUrl);
    }),
  },
);
```

Every handler uses the generator wrapper, including handlers that do not yield a service.

## Exhaustiveness

The handler map is typed over the reachable codes, so **every** reachable code must be handled — a
missing one is a type error:

```ts
craftRoute(
  'admin',
  { canActivate: craftCanActivate(guard) },
  {
    FORBIDDEN_ROLE: craftExceptionHandler(function* ({ redirectTo }) {
      return yield* redirectTo({ to: 'unauthorized' });
    }),
    // Type error: Property 'HAS_PIZZERIA' is missing.
  },
);
```

Add a guard that can raise a new code, and every route using it stops compiling until its handler is
added. A typo'd code is caught the same way because the correctly-spelled key is then missing.

## Guarded data still flows through

A `canActivate` guard's **success value** (anything other than `true`/`UrlTree`/…) becomes the
route's [guarded data](/type-safe-di-routes/route-providers). Returning it through
`craftCanActivate` keeps that behavior — `craftException` returns are never treated as data:

```ts
const authGuard = craftGen(
  () =>
    function* () {
      const user = yield* AuthToYield();
      const safeUser = user.safeValue();
      return safeUser
        ? safeUser
        : craftException({ code: 'NOT_AUTHENTICATED' });
    },
);

craftRoute('query/:userId', {
  componentDeps: {} as import('./query').GenDeps_GlobalQuery,
  loadComponent: () => import('./query'),
  canActivate: craftCanActivate(
    function* () {
      return yield* authGuard(); // success value = the user
    },
    {
      NOT_AUTHENTICATED: ({ createUrlTree }) => createUrlTree(['/login-form']),
    },
  ),
}).withProviders(({ GuardedDataToYield }) => [
  provideUser(function* () {
    return (yield* GuardedDataToYield())(); // Signal<User> → User
  }),
]);
```

## `craftCanMatch`

`craftCanMatch` is the sibling for `canMatch`. Same composition and exhaustive resolution. Unlike
`canActivate`, a `canMatch` guard produces no guarded data. A guard with no async step resolves
**synchronously**; one that suspends on [`untilSettled` / `untilDefined`](#async-guards) resolves
asynchronously (Angular's `CanMatchFn` accepts `MaybeAsync<GuardResult>`).

```ts
const featureFlagGuard = craftGen(
  (flag: string) =>
    function* () {
      const { flags } = yield* CraftConfigToYield();
      return flags[flag] ? true : craftException({ code: 'FLAG_DISABLED' });
    },
);

craftRoute('beta', {
  componentDeps: {} as import('./beta').GenDeps_Beta,
  loadComponent: () => import('./beta'),
  canMatch: craftCanMatch(
    function* () {
      yield* featureFlagGuard('beta');
      return true;
    },
    // `false` skips the route (the router tries the next match); a UrlTree redirects.
    { FLAG_DISABLED: () => false },
  ),
});
```

## Async guards {#async-guards}

The guards above are **synchronous** — every `craftGen` resolves in one pass. To decide based on data
that has to be _fetched first_, suspend the composing guard with `untilSettled` (or `untilDefined`).
The guard stays a normal generator: `yield* a(); const x = yield* untilSettled(...); yield* b()`
composes across the await, and the awaited operation's `craftException`s flow into the same
exhaustive resolvers — the compiler still forces you to handle every reachable code.

### `untilSettled` — await a resource or an HTTP call

`untilSettled` takes either a craft **resource** (`query` / `mutation` / `asyncProcess`) or a
`CraftHttpClient.*` **call** and suspends until it settles, then returns its success value.

```ts
craftRoute('users/:userId', {
  componentDeps: {} as import('./user').GenDeps_User,
  loadComponent: () => import('./user'),
  canActivate: craftCanActivate(
    function* (route) {
      const userId = route.params['userId'];

      // (a) Await an HTTP call directly — no named resource needed. Its declared
      //     `exceptions` flow into the resolvers below.
      const user = yield* untilSettled(
        CraftHttpClient.get(({ response }) => ({
          url: `/api/users/${userId}`,
          success: response<User>(),
          exceptions: [
            function* ({ status, code }) {
              if (!(yield* status(400))) return;
              if (!(yield* code('PASSWORD_REQUIRED'))) return;
              return craftException({
                code: 'PASSWORD_REQUIRED',
                scope: 'UsersFeature',
              });
            },
          ],
        })),
      );

      return user.active ? true : craftException({ code: 'INACTIVE_USER' });
    },
    {
      // Both the guard's own exception AND the HTTP call's exception are required.
      INACTIVE_USER: ({ createUrlTree }) => createUrlTree(['/inactive']),
      PASSWORD_REQUIRED: ({ createUrlTree }) => createUrlTree(['/password']),
    },
  ),
});
```

The **resource** form is identical — pass the ref (an inline `query(...)` works, though it is
reactive; prefer the HTTP form for one-shots):

```ts
const user =
  yield *
  untilSettled(
    query({ params: () => userId, loader: ({ params }) => fetchUser(params) }),
  );
```

**Settle semantics & exception routing:**

- A resource settles when its `status` reaches `'resolved'` or `'error'`. A loader `craftException`
  **short-circuits** to the resolvers; a thrown loader error is **rethrown**; otherwise the resolved
  value is returned.
- An HTTP call's declared business `exceptions` short-circuit to the resolvers. The generic
  transport-level `HttpError` (`scope: 'HttpClient'`) is **rethrown** — a network failure is not a
  resolvable business case. (An opt-in `HttpError` resolver may come later.)
- The awaited HTTP endpoint is tracked as a route dependency automatically, exactly like one used in
  a component or loader.

### `untilDefined` — await a readiness signal

`untilDefined(signal)` suspends until `signal()` is no longer `undefined`, then returns its
non-nullable value. There is no exception channel — use it to wait on a plain readiness signal.

```ts
const session = yield * untilDefined(sessionService.current);
```

### Notes

- A guard that never reaches an `untilSettled` / `untilDefined` await still resolves **synchronously**
  (no forced microtask) — existing synchronous guards are unchanged.
- This works for both `craftCanActivate` and `craftCanMatch`; async surfaces to Angular as the
  `Observable<GuardResult>` both already accept.

## Exceptions {#exceptions}

Guards fail with `craftException({ code }, payload?)` — the same typed-exception primitive used by
`query` / `mutation`:

```ts
craftException({ code: 'FORBIDDEN_ROLE' });
craftException({ code: 'RATE_LIMITED' }, { retryAfter: 30 }); // payload reaches the resolver
```

The `code` drives both the exhaustiveness check and the resolver lookup; the optional payload is
typed and forwarded to the resolver.

## When to reach for it

`craftGen` + `craftCanActivate` / `craftCanMatch` fit **sequential, fail-fast gates resolved at a
single boundary**: authorization, account-state checks, feature flags, action preconditions.

It is **not** the right tool when you want to **collect and surface multiple failures**
reactively — that is what `query` / `mutation` `hasException` and the form-submit exception model are
for. Guards stop at the first failure and hand off to a resolver.

## See Also

- [Route Providers](/type-safe-di-routes/route-providers) — consume guarded data in route providers
- [Setup](/type-safe-di-routes/setup) — the app-wide cascade DI check
- [craftService](/store/craft-service) — services yielded inside guards
