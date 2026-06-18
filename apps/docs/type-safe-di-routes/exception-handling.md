# Centralised Exception Handling

`canActivate` / `canMatch` / `resolve` stay your **writing** API — each may raise a typed
[`craftException`](./guards.md#exceptions). But instead of an inline resolver map per guard, a
single **`handleExceptions`** map on the route resolves the **union** of every code reachable from
those three steps. The non-blocking [`CraftRouterOutlet`](./pending-ui.md) applies the chosen
outcome **after the URL has committed**, so a slow guard never freezes navigation.

## The shape

```ts
const profileQuery = query({
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

route(
  'user/:userId',
  {
    loadComponent: () => import('./user-detail'),
    componentDeps: {} as import('./user-detail').GenDeps_UserDetail,
    canMatch: craftCanMatch(function* () {
      const ff = yield* FeatureFlagsToYield();
      return ff.userPageEnabled ? true : craftException({ code: 'FEATURE_OFF' });
    }),
    canActivate: craftCanActivate(function* () {
      const user = yield* AuthToYield();
      return user.safeValue() ?? craftException({ code: 'NOT_AUTHENTICATED' });
    }),
    resolve: craftResolve(function* () {
      return yield* untilSettled(profileQuery);
    }),
  },
  {
    FEATURE_OFF:       ({ redirect })        => redirect('/home'),
    NOT_AUTHENTICATED: ({ redirect, phase }) =>
      redirect(phase === 'active' ? '/login?reason=session-expired' : '/login'),
    USER_DISABLED:     ({ globalError })     => globalError(),
    HttpError:         ({ globalError })     => globalError(),
  },
),
```

`craftCanActivate` / `craftCanMatch` now take **only the guard** — there is no inline `resolvers`
argument. Every reachable code flows to the third `route(...)` argument.

## Handler context

Every handler receives a `CraftExceptionHandlerContext` typed for its exception code:

| Field             | Type / purpose                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `exception`       | The complete typed `craftException`, including `code`, `scope`, and `payload`.                                               |
| `payload`         | The typed payload passed as the second argument of `craftException(...)`.                                                    |
| `phase`           | `'enter'` during initial activation, `'active'` during a live guard re-check.                                                |
| `router`          | The native Angular `Router` instance.                                                                                        |
| `createUrlTree`   | Bound `Router.createUrlTree`, useful for building a redirect with query params or fragments.                                 |
| `navigate`        | Bound `Router.navigate`. This is imperative and returns a `Promise<boolean>`, not a handler outcome. Prefer `redirect(...)`. |
| `navigateByUrl`   | Bound `Router.navigateByUrl`. Same caveat as `navigate`: prefer returning `redirect(...)`.                                   |
| `redirect`        | Builds a redirect outcome from a string URL or `UrlTree`.                                                                    |
| `renderComponent` | Builds an outcome that renders a dedicated component.                                                                        |
| `globalError`     | Delegates rendering to the application-wide error component.                                                                 |
| `stay`            | Restores the previous URL and keeps the triggering page.                                                                     |
| `noop`            | Continues to the target despite the exception. Resolve data remains `undefined`.                                             |

A handler returns one of the five outcome constructors below. It can be a plain function or a
generator that `yield*`s craft services. It is not an `async` callback: `navigate(...)` and
`navigateByUrl(...)` return promises, not valid handler outcomes.

## Outcomes

Each handler receives a context and returns an outcome constructor:

| Outcome                | Effect                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `redirect(target)`     | Navigate away (`string` URL or `UrlTree`).                                                               |
| `renderComponent(cmp)` | Render a dedicated component instead of the target (eager `Type` or lazy `() => import()`).              |
| `globalError()`        | Render the application-wide error component (see [global error component](./global-error-component.md)). |
| `stay()`               | Cancel the navigation; restore the previous URL (stay on the triggering page).                           |
| `noop()`               | Render the target anyway, with `resolve` data left `undefined`.                                          |

The context also carries the typed `exception`, its `payload`, the Angular-native `redirect`
helpers (`createUrlTree` / `navigate` / `navigateByUrl`), and the navigation `phase` (see below). A
handler may be a **generator** that `yield*`s craft services before its outcome.

## Examples

### Typed payload and `UrlTree`

Use `redirect(...)` directly for a string URL, or combine it with `createUrlTree(...)` when Angular
navigation options are needed:

```ts
{
  NOT_AUTHENTICATED: ({ redirect }) => redirect('/auth/login'),
  RATE_LIMITED: ({ payload, createUrlTree, redirect }) =>
    redirect(
      createUrlTree(['/cooldown'], {
        queryParams: { retryAfter: payload.retryAfter },
        fragment: 'retry',
      }),
    ),
}
```

Here `payload` is inferred from `craftException({ code: 'RATE_LIMITED' }, { retryAfter: 30 })`.

### Initial entry versus live guard

```ts
{
  NOT_AUTHENTICATED: ({ phase, redirect }) =>
    redirect(phase === 'active' ? '/login?reason=session-expired' : '/login'),
}
```

### Local, global, stay, and noop outcomes

```ts
{
  ACCOUNT_LOCKED: ({ renderComponent }) =>
    renderComponent(AccountLockedPage),

  MAINTENANCE: ({ renderComponent }) =>
    renderComponent(() =>
      import('./maintenance-page').then(({ MaintenancePage }) => ({
        default: MaintenancePage,
      })),
    ),

  HttpError: ({ globalError }) => globalError(),
  UNSAVED_CHANGES: ({ stay }) => stay(),
  OPTIONAL_PROFILE_UNAVAILABLE: ({ noop }) => noop(),
}
```

`renderComponent` accepts either an eager Angular component type or a lazy function returning a
module with a `default` component export. `noop()` is appropriate only when the target can operate
without resolved data.

### Handler using a craft service

```ts
{
  FORBIDDEN_ROLE: function* ({ redirect }) {
    const config = yield* RedirectConfigToYield();
    return redirect(config.unauthorizedUrl);
  },
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

A missing code (e.g. `resolve` can throw `USER_DISABLED` but no handler) **and** an extra code (a
handler for a code nothing can produce) are both type errors, naming the offending route + codes.

## The `phase`

`phase` distinguishes the initial activation (`'enter'`) from a reactive re-evaluation (`'active'`)
of a live `canActivate` guard (see [live guards](./guards.md#reactive-guards)). Use it to soften a
reaction mid-session — e.g. a different redirect reason on session expiry — or ignore the reactive
phase entirely with `noop()`.

## HttpError

The treatment of the generic transport `HttpError` depends on the `untilSettled` form:

- `untilSettled(CraftHttpClient.get(...))` excludes `HttpError` from the routable exception union
  and rethrows it. The outlet sends that navigation error to the global error component.
- `untilSettled(queryRef)` routes every exception exposed by the query. When its loader returns a
  `CraftHttpClient` request, that includes `HttpError`, so the route must declare an explicit handler
  such as `HttpError: ({ globalError }) => globalError()`.

Declared business exceptions remain routable in both forms.
