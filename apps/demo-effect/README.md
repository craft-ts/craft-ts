# EffectTS + CraftTS demo

Application dedicated to EffectTS and CraftTS integration examples.

## Serve

From the repository root:

```bash
npx nx serve demo-effect
```

The application starts at `http://localhost:4201` and presents the
`queryEffect` example. The Effect bridge is installed globally in
`src/app/app.config.ts`; loaders return their
`Effect<A, E, R>`.

The `/shared-service` example shows an Effect service and domain operation
defined in `src/app/shared/greeting-service.ts`. The component only knows
about `loadGreeting`; `provideLayer(GreetingServiceLive)` in `app.config.ts`
satisfies the `R = GreetingService` requirement.

The `/layer-scope` example combines a global `GlobalLayer` from
`app.config.ts` with a route-scoped `RouteLayer` from the route's `providers`.
The route injector inherits the global service and adds the route service before
the Effect runs.

Use `queryEffect`, `mutationEffect`, and `asyncProcessEffect` at the boundary
between an Effect domain and a Craft primitive. Parameters remain synchronous
Craft values or sources: there is intentionally no `stateEffect`. Direct
`runEffect(effect)` remains available for low-level cases and allows an
explicit `assertNoRequirements`; adapters resolve `R` through the nearest
`provideLayer(...)`.

Typed `E` errors become Craft exceptions based on their `_tag`. Defects
(`Effect.die`) remain technical errors, and interruption remains cancellation.

```ts
const userQuery = yield* queryEffect('userQuery', {
  params: request,
  loader: ({ params }) => loadUser(params.scenario),
});

const saveUser = yield* mutationEffect('saveUser', {
  method: (user: UserInput) => user,
  loader: ({ params }) => persistUser(params),
});

const refresh = yield* asyncProcessEffect('refresh', {
  method: (id: string) => id,
  loader: ({ params }) => refreshUser(params),
});
```

Synchronous derivations continue to use `craftComputed`. Reactive parameters
remain synchronous and native to Craft: `stateEffect` does not exist.

## Verification

```bash
npx nx typecheck demo-effect
npx nx typecheck-spec demo-effect
npx nx test demo-effect
npx nx build demo-effect
```
