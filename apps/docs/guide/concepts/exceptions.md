# Exceptions as values

A declared failure is a **value you return**, not something you throw. It travels
through types instead of escaping through the stack — so the compiler can see it,
follow it, and tell you when nobody handled it.

That is the whole idea, and it rests on a line most codebases leave blurry:

- an **exception** is a failure you declared, expect, and intend to handle —
  "this email is taken", "the session expired", "that id is malformed";
- an **error** is everything else — the unexpected kind, which should surface
  loudly rather than be silently absorbed.

A `try/catch` tells you nothing about what it might catch. A returned
`craftException` carries its code and payload all the way to whoever handles it,
and the set of reachable codes is a **type** — which is what makes exhaustive
checking possible at all.

## Declaring one

```typescript
import { craftException } from '@craft-ng/core';

craftException({ code: 'TITLE_REQUIRED' }, { received: payload.title });
```

The first argument carries the `code` (and an optional `scope`); the second is a
free-form **payload**, whose type flows all the way to whoever handles it.

## Where they come from

An exception is a **returned value**, not a thrown one. Return it from the place
that detects the failure and the rest of the pipeline stops on its own:

```typescript
const { createTask } = yield* mutation('createTask', {
  // rejected before any request is sent — the loader never runs
  method: (payload: { title: string }) =>
    payload.title.trim().length === 0
      ? craftException({ code: 'TITLE_REQUIRED' }, { received: payload.title })
      : payload,

  loader: function* ({ params }) {
    return yield* CraftHttpClient.post(({ response }) => ({
      url: '/api/tasks',
      body: params,
      success: response<Task>(),
      // recognised from the response
      exceptions: [
        function* ({ status }) {
          if (!(yield* status(409))) return;
          return craftException({ code: 'TITLE_ALREADY_EXISTS' });
        },
      ],
    }));
  },
});
```

Guards, matchers and resolvers raise them the same way — see
[Route guards](/guide/routing/guards).

## Propagating through a shared utility

The interesting case isn't one primitive failing — it's a rule that lives in one
place and travels. Wrap it in a [`craftGen`](/guide/concepts/generators) and it
becomes a reusable unit that **short-circuits its callers**:

```typescript
import { craftException, craftGen, craftUntilSettled } from '@craft-ng/core';

// one business rule, declared once
export const loadReport = craftGen(function* () {
  const reportRef = yield* Report();
  const report = yield* craftUntilSettled(reportRef);

  return report.totalUsers === 0
    ? craftException({ code: 'REPORT_EMPTY' })
    : report;
});
```

Consumers just `yield*` it. If the rule rejects, everything after the yield is
skipped — no `if (result.isError)` at each level:

```typescript
const { ReportFacade } = craftService(
  { name: 'ReportFacade', scope: 'global' },
  function* () {
    const report = yield* loadReport(); // narrowed: never the exception
    return { total: report.totalUsers };
  },
);
```

`report` is the success value only. The exception left through the generator
channel, and — this is the point — **`REPORT_EMPTY` is now part of
`ReportFacade`'s reachable codes.** It keeps travelling up until someone deals
with it.

### Stopping the propagation

Two ways, and the difference matters:

**Recover locally** with `catchTag`, and the code **leaves the union** — nobody
upstream has to know about it:

```typescript
resolve: craftResolve(function* () {
  return yield* loadReport().pipe(
    catchTag('REPORT_EMPTY', function* () {
      return { totalUsers: 0, generatedAt: null };
    }),
  );
});
```

**Let it reach the route**, and `handleExceptions` must have a handler for it —
the compiler says so. That's the right choice when the failure should change what
the user sees, rather than being papered over with a default value.

::: tip Composition rule
When several utilities are composed, the **first exception wins** — the rest of
the program doesn't run. See [Program
operators](/guide/advanced/program-operators) for `catchTag` and `retry`.
:::

Working example: the `slow-page` demo raises `REPORT_EMPTY` from a `craftGen`
resolver and recovers it locally, so the route never declares a handler for it —
[slow-page.routes.ts](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/routes/slow-page/slow-page.routes.ts).

## Reading them

Every async primitive exposes its exceptions **split by origin**, and typed from
the codes you declared:

```typescript
createTask.hasException(); // boolean

createTask.exceptions().params?.TITLE_REQUIRED; // rejected by `method`
createTask.exceptions().loader?.TITLE_ALREADY_EXISTS; // produced by the request
```

The origin matters: `params` means nothing left the browser, `loader` means the
server was involved. The union is closed, so the compiler knows
`TITLE_ALREADY_EXISTS` exists and that `TITLE_TOO_LONG` doesn't.

`queryParams` follows the same shape with a `parse` origin for decode failures.

## Handling them

Where you handle an exception depends on how far it needs to travel:

| The failure concerns…       | Handle it…                                                              |
| --------------------------- | ------------------------------------------------------------------------ |
| One primitive's own UI      | Read `exceptions()` where you render it                                  |
| A form's submission         | [`insertFormSubmit`](/guide/forms/submit) — reshape the mutation's codes |
| Whether a route can render  | [Route exception handling](/guide/routing/exception-handling)             |
| Nothing in particular       | Let it be an error — the global error component catches it               |

## An unhandled exception doesn't just disappear

This is the rule that ties the whole system together, and it is easy to miss.

When a component's factory — or one of its providers — can raise a
`craftException`, that code becomes part of the component's **initialization
exceptions**. It stays attached to the component until something handles it.

Most of the time what you want is a **fallback to render**, which is
`catchBlock.exhaustive`:

```typescript
const Restricted = MyRestrictedComponent.pipe(
  withProviders([provideRestrictedData(/* … */)]),
  catchBlock.exhaustive({
    NO_ACCESS: () => p('You do not have access to this data.'),
  }),
);
```

Here the failure comes from a provider, before the template exists — so there is
no source block to preserve and the fallback renders alone. When the source
*does* exist and should stay visible, use the object form:

```typescript
catchBlock.exhaustive({
  NO_ACCESS: { render: () => p('Restricted'), showSource: true, position: 'after' },
});
```

Reach for `catchTag.exhaustive` only when the reaction is **logic** and produces
no DOM — logging it, notifying a service:

```typescript
catchTag.exhaustive({
  NO_ACCESS: function* () {
    yield* ToastService.show(() => 'No access');
  },
});
```

Either way, handling a code at the component **removes it** from the component's
contract and from the route's. Whatever you don't handle is **residual**, and it flows up
into the route's exception union — where `handleExceptions` must cover it:

```
component factory + providers
        ↓  (codes not handled by .pipe)
   residual exceptions
        ↓
route exception union  ──  handleExceptions must be exact
```

At the route, the check is exhaustive **in both directions**: a reachable code
with no handler is a type error, and a handler for a code nothing can produce is
a type error too.

::: warning Where the compile error actually appears
Today the enforcement is at the **route**, not at the component. The variadic
component `.pipe(...)` overload is deliberately kept permissive to avoid
excessive TypeScript instantiation depth, so an unhandled code there is rejected
by **runtime** dispatch rather than by the compiler. The compile-time proof is
[`assertExhaustiveRouteExceptions(routes)`](/guide/routing/exception-handling#exhaustiveness).

Practical consequence: a component rendered outside any route — in a test, or
nested inside another component — gets no compile-time reminder. Handle its
codes explicitly.
:::

Three utilities do the handling, and which one you want depends on whether the
result is logic or DOM:

| Utility                 | Handles in | Produces                                      |
| ----------------------- | ---------- | --------------------------------------------- |
| `catchBlock.exhaustive` | template   | a fallback around a source block — **the default choice** |
| `matchBlock.exhaustive` | template   | a fallback rendered from an exception value or signal |
| `catchTag.exhaustive`   | logic      | nothing renderable — call a service, log, …   |

Details on [Customization](/guide/components/customization#choosing-an-exception-utility).

## Why exhaustiveness is worth the ceremony

Because the set of reachable codes is a **type**, the compiler can compare it
against the set you handled. At the route level that comparison is an assertion
you place once per collection:

```typescript
assertExhaustiveRouteExceptions(demoRoutes);
```

A code that can be produced but isn't handled is a compile error. So is a
handler for a code nothing produces. Add a `craftException` to a guard six months
from now and the routes file tells you exactly which routes must decide what to
do about it.

## Pitfalls

**Throwing instead of returning.** A thrown value is an *error*: it bypasses the
typed union and lands in the global error path. Return the `craftException`.

**Reusing one code for two meanings.** The code is the identity the handlers
match on. Two different failures deserve two codes, with payloads carrying the
detail.

**`value()` throws on exception.** Use `safeValue()` in templates and computed
signals — see [Anatomy of a primitive](/guide/concepts/primitive-anatomy).

## See Also

- [Route exception handling](/guide/routing/exception-handling)
- [query](/guide/state/server-state) — typed HTTP exception matchers
- [Form exception handling](/guide/forms/exceptions)
