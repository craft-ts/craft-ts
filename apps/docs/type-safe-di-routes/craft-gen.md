# craftGen

Build reusable generator factories that can be composed with `yield*` and that short-circuit
through typed `craftException` values.

## Import

```typescript
import { craftGen } from '@craft-ng/core';
```

## What it does

`craftGen(factory)` wraps a generator factory and returns an invoker you can delegate to with
`yield*`.

It keeps the inner generator model intact:

- dependency yields still flow to the outer driver
- the success value is returned through `yield*`
- `craftException(...)` results are converted into a `CraftGenShortCircuit`
- the reachable exception codes remain visible at the type level

That makes `craftGen` a good fit for reusable guard logic such as role checks, feature flags, or
onboarding gates.

## Why it matters

Without `craftGen`, reusable guards quickly turn into copy-pasted generator blocks with repeated
branching and ad hoc exception handling.

`craftGen` gives you a small but important upgrade:

- parameterise one guard and reuse it across routes
- keep the route logic readable by composing with `yield*`
- preserve exhaustiveness, because every reachable exception code stays typed
- keep route dependency tracking intact, because the yielded dependencies still surface to the
  surrounding route

In practice, this is the difference between "a guard that works" and "a guard you can safely reuse
and evolve".

## Example

```typescript
import { craftException, craftGen } from '@craft-ng/core';

export const roleGuard = craftGen(function* (...roles: Role[]) {
  const { user } = yield* AuthToYield(undefined, ({ user }) => ({ user }));

  if (!user()) {
    return craftException({ code: 'NOT_AUTHENTICATED' });
  }

  return roles.includes(user()!.role)
    ? true
    : craftException({ code: 'FORBIDDEN_ROLE' });
});

export const noPizzeriaGuard = craftGen(function* () {
  const { pizzeria } = yield* AuthToYield(undefined, ({ pizzeria }) => ({ pizzeria }));

  return pizzeria() ? craftException({ code: 'HAS_PIZZERIA' }) : true;
});
```

Used from a route:

```typescript
canActivate: function* () {
  yield* roleGuard(ROLES.PIZZERIA_ADMIN);
  yield* noPizzeriaGuard();
  return true;
},
```

## How it behaves

- If the inner generator returns a normal value, that value is returned from `yield*`.
- If the inner generator returns a `craftException`, the wrapper throws `CraftGenShortCircuit`.
- If the generator yields dependencies, those yields are relayed unchanged to the caller.
- If you compose several guards, the first exception wins.

## See Also

- [`Program Operators (.pipe)`](/type-safe-di-routes/program-operators) to recover (`catchTag`) or
  retry a program locally
- [`Route Guards`](/type-safe-di-routes/guards)
- [`Exception Handling`](/type-safe-di-routes/exception-handling)
- [`craftService`](/store/craft-service) if you want to expose `AuthToYield`-style helpers
