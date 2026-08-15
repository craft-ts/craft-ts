# 9. Wire up routing

**Goal:** put the tasks page behind a route, and make a missing provider a
**compile error** instead of a blank screen.

The headline is this: **navigation only accepts routes that exist**. Not a
`string` you hope is right — a value checked against the paths your app actually
declares. A typo, a removed route, a missing param: all compile errors, at the
call site.

This is where the dev tooling earns its keep.

## Declare the route

A Craft component is mounted with `loadCraftComponent(...)`, spread into the
route:

<<< @/tests/snippets/learn/09-routing/app-routes.ts#app-routes

`withRetry` wraps the dynamic import, so a chunk that fails to download is
retried instead of dead-ending the navigation. Keep the import specifier
literal — a computed one can't be statically discovered by the bundler.

## Register the paths

Declaring the collection's paths is what makes navigation type-safe across the
app:

```typescript
declare module '@craft-ng/core' {
  interface CraftRouterRoutesRegistry {
    App: typeof appRoutes.META_PATHS;
  }
}
```

From here on, every navigation target is checked against that registry.

## Navigating

Two ways, both checked against the registry above.

**As a link**, with the `CraftRouterLink` directive:

<<< @/tests/snippets/learn/09-routing/router-link.spec.ts#router-link

**Imperatively**, by yielding the router:

<<< @/tests/snippets/learn/09-routing/navigate.spec.ts#navigate

The target is `{ to, params?, queryParams? }`, and all of it is checked:

```typescript
router.navigate({ to: 'taks' }); // ✗ not a known path
router.navigate({ to: 'tasks/:taskId' }); // ✗ params.taskId is missing
router.navigate({ to: 'tasks/:taskId', params: { id: '1' } }); // ✗ wrong param
router.navigate({ to: 'tasks/:taskId', params: { taskId: '1' } }); // ✓
```

Note that `navigate` comes from **yielding** `CraftRouter`, not from injecting
it — so the dependency is tracked and the route check can see it.

## The check that pays for all of this

Each route component gets its own check: `RouteCheckedDI` compares what the
component needs against what is actually available at that path, and `CanRun`
turns a mismatch into a TypeScript error.

The `tasks` route created above remains visible as the source of truth; the
check below validates that route's component and its `path: 'tasks'` context.
An AI can also create this Craft NG routing boilerplate very well — including
the lazy import, retry handling, route registry and DI check — from the
component and path you provide.

Declare one local alias for your app's context, then one `CanRun` per route:

<<< @/tests/snippets/learn/09-routing/route-checked-di.spec.ts#route-checked-di

The alias fixes the ambient context once — what the app provides by name
(`'CraftRouter'`) and by value (`Router | ActivatedRoute`). Each route then
supplies three things: the component, the **route inputs** it may bind (a path
param like `'taskId'`, or `never`), and a label used in error messages.

A mismatch reads like this:

```
The TaskList service is not provided in path: "tasks"
Input "taskId" is not provided in path: "tasks"
```

Remember step 3, where `toProvide` was flagged as failing only at runtime? This
is what closes that hole — **provided the proof stays in the file**. A `CanRun`
alias that nobody references still compiles; [architecture
tests](/guide/testing/architecture#assertroutediproofs) are what turn omitting
it into a failing suite.

::: tip Why one check per route
`RouteCheckedDI` validates a single component with no recursion between routes,
so the cost is flat: a file with two hundred routes costs two hundred
independent checks and never hits TypeScript's instantiation ceiling. See
[Scaling routes](/guide/routing/scaling).
:::

## Prove the exceptions are handled

Guards, matchers and resolvers can raise a `craftException` — and so can a
**component's own factory or providers**, whose unhandled codes flow up into the
route. One call asserts that every reachable code has a handler, and that no
handler exists for a code nothing produces:

```typescript
assertExhaustiveRouteExceptions(appRoutes);
```

The ESLint rule `craft-ng/require-assert-exhaustive-route-exceptions` adds it
for you.

A component can also handle its own codes with `.pipe(catchTag.exhaustive(...))`,
which removes them from the route's union — see [An unhandled exception doesn't
just disappear](/guide/concepts/exceptions). Everything else is on
[Route exception handling](/guide/routing/exception-handling).

## Wire it into the app

<<< @/tests/snippets/learn/09-routing/app-config.spec.ts#app-config

`toRoutes()` hands Angular the real routes; `META_DATA` hands the compile-time
graph to `craftAppConfig`.

## Make the DI contract enforceable

The proofs above look ceremonial: unused type aliases, a `CanRun` wrapper, a
cascade that does not descend into `loadChildren`, a separate check for pending
and error screens, another for `app.config`. Each piece is small; omitting one
is silent. TypeScript still compiles.

Architecture tests collapse that checklist into a single assertion.
`assertRouteDiProofs` walks the static graph and fails unless every routed
component — including lazy child collections — and every `craftAppConfig` error
screen is hooked to an armed mapper. TypeScript still judges whether a
dependency is provided; the architecture suite judges whether that judgement
was invoked.

Add it next to `e2e/`, in `architecture/`, then run it in CI. Full setup:
[Architecture rules](/guide/testing/architecture).

## What the user sees while a route loads

A guard or a resolver that does real work leaves the app frozen on the previous
page. Swap `provideRouter` for `provideCraftRouter` and render
`CraftRouterOutlet()` instead of `<router-outlet>`, and the URL commits
immediately while the chain runs behind it:

<<< @/tests/snippets/learn/09-routing/craft-router.spec.ts#craft-router

Those three numbers are the whole waiting story, and they exist so a fast
navigation shows **nothing at all**:

| Phase                               | What is on screen                                 |
| ----------------------------------- | ------------------------------------------------- |
| `0 → stayMs`                        | the previous page — most navigations resolve here |
| `stayMs → +blankMs`                 | a blank surface: something is coming              |
| beyond, for `pendingMinMs` at least | the pending component (a spinner, a skeleton)     |

`pendingMinMs` is the anti-flicker floor: once the loader appears it stays put,
so it can't flash for 40ms.

### Changing the pending component

The default spinner is replaceable globally:

```typescript
provideCraftRouter(
  appRoutes.toRoutes(),
  withPendingComponent(MyBrandedSpinner),
);
```

…or per route, which is where it gets interesting — a skeleton shaped like the
page it is standing in for reads far better than a spinner:

```typescript
{
  path: 'tasks',
  ...loadCraftComponent(/* … */),
  pendingComponent: () => import('./tasks/tasks-skeleton'),
  stayMs: 150, // this route is slower: get to the skeleton sooner
  blankMs: 0,  // and skip the blank phase entirely
}
```

Route-level values override the global ones, so you tune only the routes that
need it.

::: tip See it running
The `slow-page` demo exists for exactly this: two deliberately slow steps (~1.5s
each) so you can watch the stay → blank → loader phases play out. The first
visit is slow, a revisit is instant thanks to the query cache, and a "clear
cache" button replays it. Source:
[slow-page.routes.ts](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/routes/slow-page/slow-page.routes.ts).

Full details — the phase diagram, per-route overrides, view transitions and the
DI check on skeletons — are on
[Non-blocking navigation](/guide/routing/pending-ui).
:::

## Let the CLI write it

Hand-writing these pieces gets old. The CLI does it for you and the output stays
ordinary, editable TypeScript:

```shell
npx craft route add /tasks --create-component tasks/tasks
```

It picks the right collection, creates a lazy routes file per feature, adds the
loader, the check block and the registry entry, then runs ESLint and `tsc`. Use
`--dry-run` first.

## What you gained

Routing where a forgotten provider, a misspelled input, an unhandled exception or
a route pointing at nothing stops the build instead of reaching production — and
architecture tests keep those proofs from quietly disappearing.

::: details The parts you'll want later
Route-scoped providers, guards as bare generators and centralised exception
handling all live under [Routing](/guide/routing/setup). Splitting a growing collection across lazy
child files is [Scaling routes](/guide/routing/scaling). Architecture tests that keep the DI proofs
armed are [Architecture rules](/guide/testing/architecture).
:::

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 8. Build a form](/learn/08-forms)

[10. Test what you wrote →](/learn/10-testing)

</div>
