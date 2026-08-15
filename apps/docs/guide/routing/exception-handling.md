# Route exception handling

When a guard, a matcher or a resolver raises a declared exception, this page is
where you say what happens next: redirect, render a dedicated component, stay
put, or carry on. One map per route resolves the **union** of every code those
three steps can produce — and the compiler checks that the map is exactly
complete, no more and no less.

**Use it when** a route's guards, matchers or resolvers can fail in ways the user
should see.
**Not when** the failure is local to one primitive — read it off
`exceptions()` instead, see
[Exceptions as values](/guide/concepts/exceptions).

::: warning Breaking change
Every handler must use `craftExceptionHandler(function* (...) {})`. Internal
redirects use `yield* redirectTo({ to, params, queryParams, viewTransition })`;
opaque URLs or prebuilt `UrlTree` values use `redirectUrl(...)`.
`renderComponent`, route-level `errorComponent` and `withErrorComponent` accept
only `{ component | loadComponent, componentDeps }` descriptors. Bare handler
functions, `redirect(...)` and bare error components are rejected.
:::

## The common case

```ts
USER_DISABLED: craftExceptionHandler(function* ({ renderComponent }) {
  return renderComponent({
    loadComponent: () =>
      import('./user-disabled-error-page').then(
        (m) => m.UserDisabledErrorPage,
      ),
    componentDeps:
      {} as import('./user-disabled-error-page').GenDeps_UserDisabledErrorPage,
  });
}),

NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectTo }) {
  return yield* redirectTo({
    to: 'auth/login',
    queryParams: { reason: 'session-expired' },
  });
}),
```

`canActivate` / `canMatch` / `resolve` stay your **writing** API — each may raise
a typed [`craftException`](/guide/routing/guards#exceptions). Instead of an
inline resolver map per guard, a single **`handleExceptions`** map on the route
resolves the union of every code reachable from those three steps. The
non-blocking [`CraftRouterOutlet`](/guide/routing/pending-ui) applies the chosen
outcome **after the URL has committed**, so a slow guard never freezes
navigation.

The route result also exposes a route-scoped signal helper per code, such as
`injectDemoUserIdUserDisabledException()`. It returns the exact exception and
payload for the locally rendered branch, and is cleared on the next navigation.

## A full route, end to end

```ts
const { profileQuery } = query('profileQuery', {
  params: () => true,
  loader: function* () {
    return yield* CraftHttpClient.get(({ response }) => ({
      url: '/api/profile',
      success: response<Profile>(),
      exceptions: [
        function* ({ status, code }) {
          if (!(yield* status(403))) return;
          if (!(yield* code('USER_DISABLED'))) return;
          return craftException({ code: 'USER_DISABLED' });
        },
      ],
    }));
  },
});

craftRoute(
  'user/:userId',
  {
    loadComponent: ({ withRetry }) => withRetry(import('./user-detail')),
    componentDeps: {} as import('./user-detail').GenDeps_UserDetail,
    canMatch: function* () {
      const ff = yield* FeatureFlags();
      return ff.userPageEnabled ? true : craftException({ code: 'FEATURE_OFF' });
    },
    canActivate: function* () {
      const user = yield* Auth();
      return user.value() ?? craftException({ code: 'NOT_AUTHENTICATED' });
    },
    resolve: craftResolve(function* () {
      return yield* craftUntilSettled(profileQuery);
    }),
  },
  {
    FEATURE_OFF: craftExceptionHandler(function* ({ redirectTo }) {
      return yield* redirectTo({ to: 'home' });
    }),
    NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectTo, phase }) {
      return yield* redirectTo({
        to: 'login',
        queryParams: phase === 'active' ? { reason: 'session-expired' } : {},
      });
    }),
    USER_DISABLED: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
    HttpError: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
  },
),
```

`canActivate` / `canMatch` are bare generator functions — there is no guard wrapper and no inline
`resolvers` argument. Every reachable code flows to the third `craftRoute(...)` argument.

## Handler context

Every handler receives a `CraftExceptionHandlerContext` typed for its exception code:

| Field             | Type / purpose                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `exception`       | The complete typed `craftException`, including `code`, `scope`, and `payload`.               |
| `payload`         | The typed payload passed as the second argument of `craftException(...)`.                    |
| `phase`           | `'enter'` during initial activation, `'active'` during a live guard re-check.                |
| `router`          | The native Angular `Router` instance.                                                        |
| `createUrlTree`   | Bound `Router.createUrlTree`, useful for building a redirect with query params or fragments. |
| `navigate`        | Bound `Router.navigate`. Imperative; prefer returning `yield* redirectTo(...)`.              |
| `navigateByUrl`   | Bound `Router.navigateByUrl`. Imperative; prefer a redirect outcome.                         |
| `redirectTo`      | Typed internal redirect checked against `META_PATHS`; yields `CraftRouter`.                  |
| `redirectUrl`     | Explicit escape hatch for an opaque string URL or `UrlTree`.                                 |
| `renderComponent` | Builds an outcome that renders a dedicated component.                                        |
| `globalError`     | Delegates rendering to the application-wide error component.                                 |
| `stay`            | Restores the previous URL and keeps the triggering page.                                     |
| `noop`            | Continues to the target despite the exception. Resolve data remains `undefined`.             |

A handler is always a synchronous generator wrapped with `craftExceptionHandler`. It may resolve
services but cannot suspend with `craftUntilSettled` / `craftUntilDefined`.

## Outcomes

Each handler receives a context and returns an outcome constructor:

| Outcome                       | Effect                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `yield* redirectTo(input)`    | Navigate to a registered internal route with typed params/query params/view transition.                  |
| `redirectUrl(target)`         | Navigate to an opaque string URL or `UrlTree`.                                                           |
| `renderComponent(descriptor)` | Render a DI-checked `{ component \| loadComponent, componentDeps }` descriptor.                          |
| `globalError()`               | Render the application-wide error component (see [global error component](./global-error-component.md)). |
| `stay()`                      | Cancel the navigation; restore the previous URL (stay on the triggering page).                           |
| `noop()`                      | Render the target anyway, with `resolve` data left `undefined`.                                          |

The context also carries the typed `exception`, its `payload`, the Angular-native `redirect`
helpers (`createUrlTree` / `navigate` / `navigateByUrl`), and the navigation `phase` (see below). A
handler may be a **generator** that `yield*`s craft services before its outcome.

## Examples

### Typed payload and `UrlTree`

Use `redirectTo(...)` for registered application routes and `redirectUrl(...)` for a prebuilt
`UrlTree`:

```ts
{
  NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectTo }) {
    return yield* redirectTo({ to: 'auth/login' });
  }),
  RATE_LIMITED: craftExceptionHandler(function* ({ payload, redirectTo }) {
    return yield* redirectTo({
      to: 'cooldown',
      queryParams: { retryAfter: String(payload.retryAfter) },
    });
  }),
}
```

Here `payload` is inferred from `craftException({ code: 'RATE_LIMITED' }, { retryAfter: 30 })`.

### Initial entry versus live guard

```ts
{
  NOT_AUTHENTICATED: craftExceptionHandler(function* ({ phase, redirectTo }) {
    return yield* redirectTo({
      to: 'login',
      queryParams: phase === 'active' ? { reason: 'session-expired' } : {},
    });
  }),
}
```

### Local, global, stay, and noop outcomes

```ts
{
  ACCOUNT_LOCKED: craftExceptionHandler(function* ({ renderComponent }) {
    return renderComponent({
      component: AccountLockedPage,
      componentDeps: {} as import('./account-locked-page').GenDeps_AccountLockedPage,
    });
  }),
  MAINTENANCE: craftExceptionHandler(function* ({ renderComponent }) {
    return renderComponent({
      loadComponent: () => import('./maintenance-page').then((m) => m.MaintenancePage),
      componentDeps: {} as import('./maintenance-page').GenDeps_MaintenancePage,
    });
  }),
  HttpError: craftExceptionHandler(function* ({ globalError }) { return globalError(); }),
  UNSAVED_CHANGES: craftExceptionHandler(function* ({ stay }) { return stay(); }),
  OPTIONAL_PROFILE_UNAVAILABLE: craftExceptionHandler(function* ({ noop }) { return noop(); }),
}
```

The descriptor is checked independently with the O(1)
`RouteExceptionComponentCheckedDI`; it is not added to `ValidateCascadeRoutesFile`.
[Architecture tests](/guide/testing/architecture#assertroutediproofs) fail if
that proof is missing or not armed with `CanRun`.

### Handler using a craft service

```ts
{
  FORBIDDEN_ROLE: craftExceptionHandler(function* ({ redirectUrl }) {
    const config = yield* RedirectConfig();
    return redirectUrl(config.unauthorizedUrl);
  }),
}
```

Dependencies yielded by handlers participate in route DI checking, like dependencies yielded by
guards and resolvers.

## Exhaustiveness

The union is only resolvable once the whole collection is inferred, so exhaustiveness is asserted
**after** `craftRoutes` (mirroring the cascade DI check) rather than inline on each route:

```ts
export const { demoRoutes } = craftRoutes('demo', [
  /* … */
]);

// Compile error if any route's handleExceptions misses — or over-covers — a reachable code.
assertExhaustiveRouteExceptions(demoRoutes);
```

[Architecture tests](/guide/testing/architecture#assertroutediproofs) fail if a
`craftRoutes(...)` collection has no `assertExhaustiveRouteExceptions`.

A missing code (e.g. `resolve` can throw `USER_DISABLED` but no handler) **and** an extra code (a
handler for a code nothing can produce) are both type errors, naming the offending route + codes.

## Pitfalls

**`HttpError` appears or disappears depending on the `craftUntilSettled` form.**
This is the most common surprise:

- `craftUntilSettled(CraftHttpClient.get(...))` **excludes** `HttpError` from the
  routable union and rethrows it. The outlet sends that navigation error to the
  global error component.
- `craftUntilSettled(queryRef)` routes every exception the query exposes. When
  its loader returns a `CraftHttpClient` request, that **includes** `HttpError`,
  so the route must declare an explicit handler such as
  `HttpError: craftExceptionHandler(function* ({ globalError }) { return globalError(); })`.

Declared business exceptions remain routable in both forms.

**A handler cannot suspend.** It may `yield*` services, but not
`craftUntilSettled` / `craftUntilDefined`.

**Over-covering is an error too.** A handler for a code nothing can produce fails
the exhaustiveness assert, same as a missing one.

::: details The `phase` field
`phase` distinguishes the initial activation (`'enter'`) from a reactive
re-evaluation (`'active'`) of a live `canActivate` guard (see [live
guards](/guide/routing/guards#reactive-guards)). Use it to soften a reaction
mid-session — a different redirect reason on session expiry, say — or ignore the
reactive phase entirely with `noop()`.
:::

## See Also

- [Exceptions as values](/guide/concepts/exceptions) — the concept
- [Route guards](/guide/routing/guards) — where exceptions are raised
- [Global error component](/guide/routing/global-error-component)
- [Architecture rules](/guide/testing/architecture) — `assertRouteDiProofs` keeps the exhaustiveness assert in place
