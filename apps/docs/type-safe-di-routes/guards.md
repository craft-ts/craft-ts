# Route Guards

Write **reusable, parameterised** route guards, **compose** them in a single `canActivate` /
`canMatch`, and resolve their failure cases **exhaustively** — an unhandled case is a **type error**.

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
import { craftCanActivate, craftException, craftGen, route } from '@craft-ng/core';

// Reusable guards — each returns a success value | craftException(...)
const roleGuard = craftGen((...roles: Role[]) =>
  function* () {
    const { user } = yield* CraftAuthToYield(undefined, ({ user }) => ({ user }));
    if (!user()) return craftException({ code: 'NOT_AUTHENTICATED' });
    return roles.includes(user()!.role)
      ? true
      : craftException({ code: 'FORBIDDEN_ROLE' });
  },
);

const noPizzeriaGuard = craftGen(() =>
  function* () {
    const { pizzeria } = yield* CraftAuthToYield(undefined, ({ pizzeria }) => ({ pizzeria }));
    return pizzeria() ? craftException({ code: 'HAS_PIZZERIA' }) : true;
  },
);

route('admin', {
  componentDeps: {} as import('./admin').GenDeps_Admin,
  loadComponent: () => import('./admin'),
  canActivate: craftCanActivate(
    function* () {
      yield* roleGuard(ROLES.PIZZERIA_ADMIN); // short-circuits on exception
      yield* noPizzeriaGuard();
      return true;
    },
    // Exhaustive: keys === the reachable exception codes. A missing key is a type error.
    {
      NOT_AUTHENTICATED: ({ createUrlTree }) => createUrlTree(['/auth/login']),
      FORBIDDEN_ROLE: ({ createUrlTree }) => createUrlTree(['/unauthorized']),
      HAS_PIZZERIA: ({ createUrlTree }) => createUrlTree(['/dashboard']),
    },
  ),
});
```

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

## The resolver context

Each resolver receives the **native Angular `Router`** redirect helpers plus the resolved exception:

| Field            | Type                       |
| ---------------- | -------------------------- |
| `createUrlTree`  | `Router['createUrlTree']`  |
| `navigate`       | `Router['navigate']`       |
| `navigateByUrl`  | `Router['navigateByUrl']`  |
| `router`         | `Router`                   |
| `exception`      | the `craftException` (typed to that code) |
| `payload`        | the exception's payload    |

Because the helpers are the native Angular ones, you redirect with the usual commands array — no
route registry required:

```ts
{
  RATE_LIMITED: ({ createUrlTree, payload }) =>
    createUrlTree(['/cooldown'], { queryParams: { retryAfter: payload.retryAfter } }),
}
```

A resolver returns a `GuardResult` (`boolean | UrlTree | RedirectCommand`). The `payload` is taken
from `craftException({ code }, payload)`'s second argument and typed per code.

## Resolvers can yield services

A resolver may be a **generator** that `yield*`s craft services before building the redirect — for
example to read the login URL from a config service. Those yields are tracked exactly like the
guards' own dependencies, so a service used only at redirect-time still flows into the route's
[cascade DI](/type-safe-di-routes/setup) (yield an unprovided service and it surfaces as a
missing-provider error on the route):

```ts
canActivate: craftCanActivate(
  function* () {
    yield* roleGuard(ROLES.ADMIN);
    return true;
  },
  {
    // Generator resolver — `RedirectConfig` becomes a tracked dependency of the route.
    FORBIDDEN_ROLE: function* ({ createUrlTree }) {
      const { unauthorizedUrl } = yield* RedirectConfigToYield();
      return createUrlTree([unauthorizedUrl]);
    },
  },
),
```

Plain function resolvers and generator resolvers can be mixed freely in the same map.

## Exhaustiveness

The `resolvers` map is a mapped type over the reachable codes, so **every** reachable code must be
handled — a missing one is a type error:

```ts
craftCanActivate(guard, {
  FORBIDDEN_ROLE: ({ createUrlTree }) => createUrlTree(['/unauthorized']),
  // ❌ Type error: Property 'HAS_PIZZERIA' is missing
});
```

Add a guard that can raise a new code, and every `craftCanActivate` using it stops compiling until
its resolver is added. A typo'd code is caught the same way — the correctly-spelled key is now
missing. As a runtime safety net, an unmapped code throws `Unhandled guard exception: <CODE>`.

## Guarded data still flows through

A `canActivate` guard's **success value** (anything other than `true`/`UrlTree`/…) becomes the
route's [guarded data](/type-safe-di-routes/route-providers). Returning it through
`craftCanActivate` keeps that behavior — `craftException` returns are never treated as data:

```ts
const authGuard = craftGen(() =>
  function* () {
    const user = yield* AuthToYield();
    const safeUser = user.safeValue();
    return safeUser ? safeUser : craftException({ code: 'NOT_AUTHENTICATED' });
  },
);

route('query/:userId', {
  componentDeps: {} as import('./query').GenDeps_GlobalQuery,
  loadComponent: () => import('./query'),
  canActivate: craftCanActivate(
    function* () {
      return yield* authGuard(); // success value = the user
    },
    { NOT_AUTHENTICATED: ({ createUrlTree }) => createUrlTree(['/login-form']) },
  ),
}).withProviders(({ GuardedDataToYield }) => [
  provideUser(function* () {
    return (yield* GuardedDataToYield())(); // Signal<User> → User
  }),
]);
```

## `craftCanMatch`

`craftCanMatch` is the sibling for `canMatch`. Same composition and exhaustive resolution; the
resolver's `GuardResult` is returned **synchronously** (as `canMatch` requires). Unlike
`canActivate`, a `canMatch` guard produces no guarded data.

```ts
const featureFlagGuard = craftGen((flag: string) =>
  function* () {
    const { flags } = yield* CraftConfigToYield();
    return flags[flag] ? true : craftException({ code: 'FLAG_DISABLED' });
  },
);

route('beta', {
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
