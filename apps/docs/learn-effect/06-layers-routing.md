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

Keep route providers in a named tuple so the compile-time proof can inspect it:

```typescript
const teamRouteProviders = [
  provideLayer(SupportTeamLive),
] as const;

const routes = craftRoutes('app', [
  {
    path: 'team',
    ...loadCraftComponent(
      () => import('./team').then(({ default: component }) => component),
      teamRouteProviders,
    ),
  },
]);
```

The team query can require `SessionService | TeamContextService` while the
component only sees `TeamOverview`. Route-scoped resources are closed when the
route injector is destroyed, so Layer scopes do not leak across navigation.

## Prove requirements at compile time

Effect requirements are not regular Craft services, so add an explicit proof:

```typescript
import type { Effect } from 'effect';
import type { AppProvidedDependencyValuesOf, CanRun } from '@craft-ts/core';
import type {
  EffectRequirementsCheckedDI,
  ProvidedEffectServicesOf,
} from '@craft-ts/effect';

type AppProvidedEffectServices = AppProvidedDependencyValuesOf<
  typeof appConfig
>;

type CheckTeam = EffectRequirementsCheckedDI<
  Effect.Services<typeof loadTeamOverview>,
  AppProvidedEffectServices | ProvidedEffectServicesOf<typeof teamRouteProviders>
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
const filters = yield* queryParams('filters', {
  state: {
    search: {
      fallbackValue: '',
      codec: {
        decode: (value: string) => value,
        encode: (value: string) => value,
      },
    },
  },
});

const users = yield* queryEffect('users', {
  params: () => filters(),
  loader: ({ params }) => searchUsers(params),
});
```

There is no `queryParamsEffect`: Craft synchronises the URL, while the Effect
loader reacts to the resulting typed params.

## What you gained

Effect Layers now follow Craft's app and route scopes, their requirements are
checked, and typed Effect failures cannot silently disappear at a route.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 5. Write data with Effect](/learn-effect/05-write-data)

[7. Build forms and validate boundaries →](/learn-effect/07-forms-validation)

</div>
