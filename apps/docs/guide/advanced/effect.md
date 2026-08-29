# Using Effect with CraftTS

Effect belongs in CraftTS when the problem is a **domain program**: composing
services, modelling typed failures, controlling resources, or running an
operation that crosses an I/O boundary. CraftTS remains responsible for
components, fine-grained rendering, reactive state and resource lifecycles.

The integration is deliberately a boundary, not a second UI runtime:

```text
Craft component / template
        ↓
Craft primitive or generator
        ↓
Effect<A, E, R>
        ↓
Layer<R> provided by the Craft injector
```

If a value is only local UI state, keep it in Craft. If it is a domain operation
with typed errors or services, define it as an Effect and adapt it at the Craft
boundary.

## The short decision

| Need                                               | Use                              | Why                                                              |
| -------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| Toggle, draft, selection or other local UI value   | `state`                          | Craft owns reactive UI state                                     |
| Read data with an Effect loader                    | `queryEffect`                    | loading, caching, cancellation and exceptions are Craft concerns |
| Derive a reactive value from a synchronous Effect  | `computedEffect`                 | runs a `SyncOp` Effect in place — a value, not a resource        |
| Expose a synchronous Effect as a callable method   | `methodEffect`                   | the Effect counterpart of `craftMethod`                          |
| Run a synchronous Effect in a lower-level position | `syncEffect`                     | `params`, a `craftMethod`, a `state` updater                     |
| Write data with an Effect loader                   | `mutationEffect`                 | explicit writes and mutation reactions                           |
| Run an explicit command                            | `asyncProcessEffect`             | export, refresh, share action or other non-resource process      |
| Provide Effect services                            | `provideLayer`                   | app and route injectors own Layer scope                          |
| Select a service from a Craft factory              | `effectService`                  | records the Effect service dependency and selected members       |
| Yield one Effect in a Craft generator              | `runEffect`                      | low-level bridge with typed Craft exceptions                     |
| Validate data with Effect Schema                   | `Schema.toStandardSchemaV1(...)` | uses Craft's schema boundary without coupling core to Effect     |

There is intentionally no `stateEffect`. A reactive value is not made better by
being an Effect. Use `state` for the value, and use Effect for the computation
that loads or changes it.

## Install the packages

```shell
npm i @craft-ts/core@beta @craft-ts/component@beta @craft-ts/effect@beta
npm i effect@rc
```

Keep the three Craft packages on the same version. `@craft-ts/effect` declares
`effect` as a peer dependency.

## Run Effect diagnostics

For an Effect-enabled project, make the diagnostics command part of the normal
feedback loop:

```shell
npm run effect-check
# or, from the repository root:
node tools/run-effect-tsgo.mjs diagnostics \
  --project apps/demo-effect/tsconfig.json \
  --severity error,warning,message
```

The repository wrapper prints the resolved project scope, the TypeScript
program file count and source candidates excluded by the project configuration,
then asks EffectTS to print per-file progress. It refuses a zero-file program,
which catches a wrong `--project`, an over-broad `exclude`, or an `include` that
misses the intended source tree before the check can look green.

Review warnings in two groups: the existing baseline that is accepted for the
project, and warnings introduced by the current change. Keep the command's
scope explicit in CI and link a diagnostic back to this page when handing the
result to an agent. `--project=...` and `-p ...` are both supported.

## Install the bridge once

The bridge teaches Craft's generator driver how to execute a yielded Effect.
Install it at application bootstrap:

```typescript
import { provideAppInitializer } from '@craft-ts/core';
import { installCraftEffectBridge } from '@craft-ts/effect';

export const appConfig = craftAppConfig({
  providers: [
    provideAppInitializer(() => {
      installCraftEffectBridge();
    }),
  ],
});
```

In a test, install it in `beforeEach` and call the returned disposer in
`afterEach`. Do not install a new bridge in every loader or component.

## Keep components in Craft

A Craft component still has a generator factory and a typed template. The
component should call a domain operation, not resolve its repository or start a
fiber from a click handler:

```typescript
import { button, craftComponent, p } from '@craft-ts/component';
import { queryEffect } from '@craft-ts/effect';
import { loadUserProfile } from './profile-domain';

export const Profile = craftComponent(
  'Profile',
  {},
  function* () {
    const profile = yield* queryEffect('profile', {
      params: () => 'user-ada',
      loader: ({ params }) => loadUserProfile(params),
    });

    return { profile };
  },
  ({ profile }) => [
    p(function* () {
      const user = yield* profile.value();
      return user?.name ?? 'Loading…';
    }),
    button(
      'reload',
      {
        *click() {
          yield* profile.reload();
        },
      },
      'Reload',
    ),
  ],
);
```

The template consumes Craft readers. It does not subscribe to an Effect, call
`Effect.runPromise`, or convert a Promise into a signal manually.

## Define the domain in Effect

Use Effect for domain contracts and implementations. Tagged errors are values in
the `E` channel:

```typescript
import { Context, Data, Effect, Layer } from 'effect';

export class UserNotFound extends Data.TaggedError('UserNotFound')<{
  readonly userId: string;
}> {}

export type UserRepository = {
  readonly byId: (userId: string) => Effect.Effect<User, UserNotFound>;
};

export class UserRepositoryService extends Context.Service<
  UserRepositoryService,
  UserRepository
>()('app/UserRepository') {}

export const UserRepositoryLive = Layer.sync(UserRepositoryService)(() => ({
  byId: (userId) => findUserInDatabase(userId),
}));

export const loadUserProfile = Effect.fnUntraced(function* (userId: string) {
  const repository = yield* UserRepositoryService;
  return yield* repository.byId(userId);
});
```

The resulting program carries its success value, its typed failures and its
requirements. A Craft component only needs `loadUserProfile`; it does not need
to know which Layer implements `UserRepositoryService`.

## Choose the right adapter

### `queryEffect`: Effect-backed reads

```typescript
const users =
  yield *
  queryEffect('users', {
    params: () => ({ filter: search() }),
    loader: ({ params }) => listUsers(params),
  });
```

Use it when the result is server or domain state. Craft owns `status`, loading,
previous value, cancellation and reloading. The loader returns
`Effect<Value, Error, Requirements>`.

The `params` factory and `method` are synchronous. They may read Craft
dependencies, but must not create an Effect or read an Effect service. The
loader is the only Effect-aware callback:

```typescript
const users =
  yield *
  queryEffect('users', {
    params: function* () {
      const input = yield* searchInput();
      return resolveSearchParams(input);
    },
    loader: ({ params }) => listUsers(params),
  });
```

The Effect ESLint rule enforces this boundary. A **declared-synchronous** Effect
is allowed here through `syncEffect(...)`; for an input that has to suspend, use
a `queryEffect` and feed its settled value to this one.

### `mutationEffect`: Effect-backed writes

```typescript
const saveUser =
  yield *
  mutationEffect('saveUser', {
    method: (input: UserInput) => input,
    loader: ({ params }) => saveUserEffect(params),
  });
```

Trigger it with `yield* saveUser.mutate(input)`. Use the normal Craft
`insertReactOnMutation` insertion to reload a query or apply an optimistic patch.
The mutation `method` only maps its arguments to synchronous params. The
`loader` is the only Effect-aware callback.

### `asyncProcessEffect`: explicit commands

```typescript
const exportUsers =
  yield *
  asyncProcessEffect('exportUsers', {
    method: (filter: Filter) => filter,
    loader: ({ params }) => exportUsersEffect(params),
  });

yield * exportUsers.method(currentFilter);
```

The `asyncProcessEffect` method follows the same rule: it returns plain params;
the loader owns the asynchronous Effect program.

Use it for an operation with a lifecycle but without a query cache or mutation
relationship.

### `methodEffect`: synchronous callable methods

Use `methodEffect` when a domain operation is a synchronous Effect and should be
exposed as a callable method rather than as a resource:

```typescript
const formatPrice = methodEffect('formatPrice', (cents: number) =>
  Effect.gen(function* () {
    yield* SyncOp;
    return `${(cents / 100).toFixed(2)} €`;
  }),
);

formatPrice(1499); // '14.99 €'
```

It is the Effect-aware convenience form of `craftMethod`. The `SyncOp`
requirement is mandatory because the method returns immediately. For an Effect
that can suspend, use `asyncProcessEffect`, `mutationEffect`, or
`queryEffect`.

### `computedEffect`: a derived value, not a resource

`computedEffect` runs a **synchronous** Effect in place and hands back a value.
It is the adapter for a derivation — a formatted price, a validity flag — where
`queryEffect` would wrap the answer in a resource with a loading state nothing
can ever be in:

```typescript
import { computedEffect } from '@craft-ts/effect';

const totalLabel = computedEffect('totalLabel', function* () {
  const lines = yield* cartLines();
  return cartTotalLabel(lines); // returns the Effect, never runs it
});
```

The factory reads Craft dependencies with `yield*` and **returns** an Effect;
the adapter runs it in place against the nearest `provideLayer(...)`. Read the
result like any `craftComputed` — no `value`, no `isLoading`, no
`pendingNode`.

The Effect it returns must be declared synchronous — `Effect<A, E, SyncOp>` —
for the same reason `syncEffect` requires it: a computation is asked for its
value now and cannot suspend to produce it, so one whose `R` does not carry
`SyncOp` is refused at the call site. See [Run a synchronous member from a
computed](#run-a-synchronous-member-from-a-computed) for what `SyncOp` is and
the three mechanisms that check the claim.

Use `syncEffect` instead when the synchronous Effect is not the whole
derivation — inside a `craftMethod`, a `params`, or a `state` updater.

### `runEffect`: the low-level form

Use `runEffect` when an Effect is yielded directly by a guard, resolver or Craft
program and you need its typed errors to be visible to Craft:

```typescript
import { runEffect } from '@craft-ts/effect';

const user = yield * runEffect(loadUserProfile(userId));
```

The adapter is the right choice for most component resources. A bare
`yield* someEffect` may execute at runtime, but it does not advertise the
Effect's `E` channel to Craft's route-exception analysis. `runEffect` does.

## Provide services with `Layer`

`provideLayer` attaches a built Effect context to a Craft injector:

```typescript
export const appConfig = craftAppConfig({
  providers: [provideLayer(Layer.mergeAll(UserRepositoryLive, SessionLive))],
});
```

Use one merged Layer per injector level. A route can add a narrower Layer:

```typescript
const routes = craftRoutes('app', [
  {
    path: 'team',
    ...loadCraftComponent(() => import('./team'), [
      provideLayer(TeamContextLive),
    ] as const),
  },
]);
```

The parent context is reused and the child Layer is added for that route. Its
Effect scope is closed with the route injector.

For compile-time coverage, compare the program's `Effect.Services<...>` with
the values provided by the app and route:

```typescript
type Check = EffectRequirementsCheckedDI<
  Effect.Services<typeof loadTeamOverview>,
  | AppProvidedEffectServices
  | ProvidedEffectServicesOfRoute<typeof routes._routes, 'team'>
>;
type CanRunCheck = CanRun<Check>;
```

See [route-scoped Layers in the Learn path](/learn-effect/06-layers-routing) for
the full `AppProvidedDependencyValuesOf` setup.

## Understand the error mapping

The bridge keeps Effect's distinctions intact:

| Effect outcome             | Craft outcome                         | Handle it with                          |
| -------------------------- | ------------------------------------- | --------------------------------------- |
| `Effect.succeed(value)`    | resource value / generator result     | normal rendering                        |
| typed `Effect.fail(error)` | Craft exception keyed by `error._tag` | `matchNode`, `catchTag`, route handlers |
| `Effect.die(defect)`       | technical error                       | error boundary / monitoring             |
| interruption               | cancellation                          | normally no user-facing handler         |

Use exhaustive matching for business errors:

```typescript
matchNode.exhaustive(resource.exception, '_tag', {
  UserNotFound: () => p('No user was found.'),
  Unauthorized: () => p('Your session has expired.'),
});
```

The error union is only visible to the compiler when the Effect crosses through
`queryEffect`, `mutationEffect`, `asyncProcessEffect` or `runEffect`.

## Use Effect Schema at data boundaries

`@craft-ts/core` accepts Standard Schema. Effect Schema participates through one
conversion call:

```typescript
import { Schema } from 'effect';

const UserInput = Schema.toStandardSchemaV1(
  Schema.Struct({
    name: Schema.String,
    email: Schema.String,
  }),
);

const saveUser =
  yield *
  mutationEffect('saveUser', {
    methodSchema: UserInput,
    method: (input) => input,
    loader: ({ params }) => saveUserEffect(params),
  });
```

This schema interop does not require `@craft-ts/effect`; it follows the Standard
Schema contract. Use the [schema validation guide](/guide/state/schema-validation#effect-schema)
for async decoding and loader result validation.

## Select an Effect service from Craft

Most components should consume a domain operation. A Craft service or adapter
that really needs an Effect service can select only the members it uses:

```typescript
const { byId } =
  yield * effectService(UserRepositoryService, ({ byId }) => ({ byId }));
```

The selection narrows the graph and keeps generic member signatures intact. It
does not replace `Layer`; the service still comes from the nearest
`provideLayer(...)`.

## Run a synchronous member from a computed

`params`, `craftComputed(...)` and `craftMethod(...)` run on Craft's synchronous
driver: they complete on one tick and cannot wait. `Effect<A, E, R>` does not say
whether running an Effect will suspend, and a service member makes it worse — a
`Layer` closes over its dependencies at construction, so a network call and a
pure calculation both surface as `R = never`.

Declare the difference in `R`, the one channel Effect accumulates:

```typescript
export type CartPricingShape = {
  readonly fetchCatalog: (skus: readonly string[]) => Effect.Effect<Catalog>;
  readonly lineTotal: (line: CartLine) => Effect.Effect<number, never, SyncOp>;
};
```

`SyncOp` is a phantom requirement: nothing provides it, it costs nothing at
runtime, and `Effect<A, E, never>` is assignable to `Effect<A, E, SyncOp>` — so
declaring it in the shape is enough, the implementation needs no ceremony. Where
`R` is inferred (a standalone `Effect.gen` calling nothing already marked), add
`yield* SyncOp` to the body.

Run it with `syncEffect(...)`, which resolves in place instead of suspending:

```typescript
const totalLabel = craftComputed('totalLabel', function* () {
  const cents = yield* syncEffect(cartTotal(yield* lines()));
  return yield* syncEffect(formatPrice(cents));
});
```

Requirements other than `SyncOp` travel through untouched — the level in force
satisfies them exactly as it does for a loader. The only thing checked at the
type level is that `SyncOp` is among them.

The declaration is a claim, and three independent mechanisms check it: the type
refuses an undeclared Effect at the call; `craft-ts/sync-effect-body` reads the
body, every branch at once, and rejects one that yields something async; and at
runtime `syncEffect` goes through `Effect.runSyncExitWith`, which cannot suspend
— a broken promise throws `CraftEffectNotSynchronous` at the first call rather
than freezing the UI.

Full walkthrough: [Declare a synchronous member](/learn-effect/03-effect-domain#declare-a-synchronous-member).

## Testing

Use `mockEffectService` for a focused Layer:

```typescript
const repository = mockEffectService(UserRepositoryService, {
  byId: () => Effect.succeed(expectedUser),
});
```

Combine it with Craft's register-based tests. The Effect mock covers the Effect
service; the Craft register covers every Craft dependency and boundary. An
unstubbed member fails with `UnstubbedEffectMember` instead of silently returning
an incomplete value.

See [testing with Effect](/learn-effect/08-testing) and [browser
boundaries](/guide/testing/browser-boundaries).

## Package map

| Package                 | Responsibility                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@craft-ts/component`   | functional Craft components and typed templates                                                                                                                |
| `@craft-ts/core`        | Craft primitives, services, routing, forms, testing and the current server-function registry                                                                   |
| `@craft-ts/effect`      | Effect bridge, `Layer` providers, Effect-aware primitives, service selection, mocks and server execution helpers                                               |
| `@craft-ts/i18n-effect` | the Effect adapter over an `@craft-ts/i18n` runtime: `provideI18nRuntime`, `translateEffect`, `I18nEffectService` — see [i18n with Effect](/guide/i18n/effect) |
| `effect`                | `Effect`, `Context.Service`, `Layer`, `Schema`, tagged errors and the Effect runtime                                                                           |
| `@effect/platform-*`    | Effect-native platform adapters; used by the current server-function experiment                                                                                |
| `@craft-ts/dev-tools`   | generators, migration tools, graph and architecture checks                                                                                                     |

Install only the packages needed by the layer you are building. For example,
Effect Schema validation can be used with `@craft-ts/core` alone; the bridge and
Effect-aware resource adapters require `@craft-ts/effect`.

## Server functions: current POC

The current server-function integration is a **proof of concept**, not a final
API. It currently combines:

- `serverFunction` and `createServerFunctionClient` from `@craft-ts/core`;
- `executeEffect` and `effectServerMiddleware` from `@craft-ts/effect`;
- `Effect`/`Layer` on the server;
- a local HTTP transport and `@effect/platform-node` in the demo.

The client must import only the server function's type, while the server owns
the implementation and server-only Layers. Authentication and authorization
must be checked again on the server; a client Layer is never a security boundary.

See the [server functions POC chapter](/learn-effect/09-server-functions) and
the [running demo](https://github.com/craft-ts/craft-ts/tree/main/apps/demo-with-server-function).
Expect the transport, file conventions, middleware API and production
integration to change before this becomes a stable feature.

## Common mistakes

- **Putting every value in Effect:** keep local UI state in `state` and URL state
  in `queryParams`.
- **Subscribing in a component:** return an Effect from a resource adapter and
  let Craft own loading and cancellation.
- **Using `Effect.die` for a business case:** use a tagged error in `E` so the UI
  can handle it exhaustively.
- **Providing a Layer inside a loader:** provide it at app or route scope so its
  lifetime and requirements are visible.
- **Trusting client context in a server function:** treat it as a claim and
  verify it on the server.
- **Using a bare `yield* effect` in a route program:** use `runEffect` so Craft
  sees the typed exception union.
- **Declaring a member `SyncOp` to get it into a computed:** the marker states a
  fact, it does not create one. If the member can suspend, move the work to a
  loader — the runtime will refuse it anyway.

## See also

- [Learn CraftTS with Effect](/learn-effect/)
- [Which primitive should I use?](/guide/concepts/choose-primitive)
- [Exceptions as values](/guide/concepts/exceptions)
- [Program operators](/guide/advanced/program-operators)
- [Effect Schema](/guide/state/schema-validation#effect-schema)
- [Effect integration tests](/learn-effect/08-testing)
