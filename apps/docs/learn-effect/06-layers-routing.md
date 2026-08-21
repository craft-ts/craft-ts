# 6. Provide Layers and route the app

**Goal:** make Effect requirements explicit at the same scopes as your Craft
injectors.

## Provide one application Layer

`provideLayer` builds an Effect context and stores it on the Craft injector:

```typescript
import { Layer } from 'effect';
import { provideLayer } from '@craft-ts/effect';

export const appConfig = craftAppConfig({
  providers: [
    provideLayer(Layer.mergeAll(AccessPolicyLive, SessionLive)),
  ],
});
```

The Layer is built once at that injector level. Child injectors reuse the parent
context and add their own services.

## Add a route Layer

Inline route providers in `loadCraftComponent(...)`; the compile-time proof
preserves and inspects the tuple from the typed route collection:

```typescript
const routes = craftRoutes('app', [
  {
    path: 'team',
    ...loadCraftComponent(
      () => import('./team').then(({ default: component }) => component),
      [provideLayer(SupportTeamLive)] as const,
    ),
  },
]);
```

The team query can require `SessionService | TeamContextService` while the
component only sees `TeamOverview`. Route-scoped resources are closed when the
route injector is destroyed, so Layer scopes do not leak across navigation.

## Layer scopes follow Craft provider scopes

`provideLayer(...)` is a normal Craft provider, so the same Effect context can
be attached at every Craft scope that accepts providers:

| Scope | Where to put `provideLayer(...)` | Lifetime and visibility |
| --- | --- | --- |
| Application | `appConfig.providers` | shared by the whole application |
| Route | the route's `providers` array | shared by that route and its children |
| Component | `craftComponent` meta `providers` | limited to that component subtree |
| Primitive | a primitive config's `providers` | limited to that primitive |
| Insertion | the containing primitive's `providers` | inherited by its insertion callbacks and methods |

For example, a component or a primitive can provide a local implementation
without changing the application Layer:

```typescript
const Profile = craftComponent(
  'Profile',
  { providers: [provideLayer(AccessPolicyLive)] },
  /* … */
);

const profile = yield* queryEffect('profile', {
  providers: [provideLayer(AccessPolicyLive)],
  params: () => 'user-ada',
  loader: ({ params }) => checkUserAccess(params),
});
```

An insertion receives the primitive's injector, so its generators and methods
see the primitive's Layer as well. There is no separate `provideLayer` argument
on an insertion today; use the containing primitive's `providers` to scope it.
If two services must be provided at the same scope, merge them into one Layer:

```typescript
providers: [provideLayer(Layer.mergeAll(AccessPolicyLive, SessionLive))]
```

Child scopes inherit the parent context and can add a more local implementation
of a service. Their scopes are closed with the corresponding Craft injector.

## Prove requirements at compile time

Effect requirements are not regular Craft services, so add an explicit proof:

```typescript
import type { Effect } from 'effect';
import type { AppProvidedDependencyValuesOf, CanRun } from '@craft-ts/core';
import type {
  EffectRequirementsCheckedDI,
  ProvidedEffectServicesOfRoute,
} from '@craft-ts/effect';

type AppProvidedEffectServices = AppProvidedDependencyValuesOf<
  typeof appConfig
>;

type CheckTeam = EffectRequirementsCheckedDI<
  Effect.Services<typeof loadTeamOverview>,
  AppProvidedEffectServices |
    ProvidedEffectServicesOfRoute<typeof routes._routes, 'team'>
>;
type CanRunTeam = CanRun<CheckTeam>;
```

Remove `SupportTeamLive` and `CanRunTeam` becomes a useful type error naming the
missing Effect service. This is the Effect equivalent of Craft's `RouteCheckedDI`.

## Route errors are still exhaustive

`queryEffect` and `runEffect` make tagged Effect errors visible to Craft's route
exception analysis. Keep the route map exhaustive:

```typescript
const { routes } = craftRoutes('app', [
  {
    path: '',
    ...loadCraftComponent(() => import('./profile')),
    handleExceptions: {
      UserNotFound: craftExceptionHandler(/* … */),
      Unauthorized: craftExceptionHandler(/* … */),
    },
  },
]);

assertExhaustiveRouteExceptions(routes);
```

## Keep URL state in Craft

URL state is a UI concern, so it stays a native `queryParams` primitive even in
an Effect application:

```typescript
import { Schema } from 'effect';

const Search = Schema.String;
const searchCodec = {
  decode: Schema.decodeUnknownSync(Search),
  encode: Schema.encodeSync(Search),
};

const filters = yield* queryParams('filters', {
  state: {
    search: {
      fallbackValue: '',
      codec: searchCodec,
    },
  },
});

const users = yield* queryEffect('users', {
  params: () => filters(),
  loader: ({ params }) => searchUsers(params),
});
```

The codec remains synchronous, as required by `queryParams`, but validation and
encoding now come from an Effect `Schema`. Replace `Schema.String` with a
transformation schema when the URL representation differs from the value used
by the component.

There is no `queryParamsEffect`: Craft synchronises the URL, while the Effect
loader reacts to the resulting typed params.

## What you gained

Effect Layers now follow Craft's app and route scopes, their requirements are
checked, and typed Effect failures cannot silently disappear at a route.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 5. Write data with Effect](/learn-effect/05-write-data)

[7. Build forms and validate boundaries →](/learn-effect/07-forms-validation)

</div>
