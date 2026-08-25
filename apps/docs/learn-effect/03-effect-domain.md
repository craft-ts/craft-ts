# 3. Put the domain in Effect

**Goal:** define typed business failures and services without making the Craft
component know how they are provided.

## Typed failures are values

Effect's tagged errors map naturally to Craft's exception channel:

```typescript
import { Context, Data, Effect } from 'effect';

export class UserNotFound extends Data.TaggedError('UserNotFound')<{
  readonly userId: string;
}> {}

export class Unauthorized extends Data.TaggedError('Unauthorized')<{
  readonly reason: string;
}> {}

type User = {
  readonly id: string;
};

type UserRepository = {
  readonly find: (userId: string) => Effect.Effect<User | undefined>;
};

export class UserRepositoryService extends Context.Service<
  UserRepositoryService,
  UserRepository
>()('app/UserRepository') {}

export function loadUser(userId: string) {
  return Effect.gen(function* () {
    const repository = yield* UserRepositoryService;
    const user = yield* repository.find(userId);
    if (!user) return yield* new UserNotFound({ userId });
    return user;
  });
}
```

The program has the shape `Effect<User, UserNotFound, UserRepositoryService>`.
`yield* UserRepositoryService` gets the repository from the Effect context;
`yield* repository.find(userId)` then runs the `Effect` returned by its method.
`UserNotFound` is a business outcome that the UI can handle. An unexpected
defect raised by `Effect.die` remains a technical error; it is not turned into a
business exception.

`Data.TaggedError` creates a **yieldable error** in Effect v4, so this is the
idiomatic form inside `Effect.gen`:

```typescript
if (!user) return yield* new UserNotFound({ userId });
```

The explicit equivalent is `yield* Effect.fail(new UserNotFound({ userId }))`;
there is no `Effect.failed` constructor. At the Craft boundary, yield the
effect through `runEffect(...)` instead of yielding the error instance directly.

## Define an Effect service

Use `Context.Service` for the contract and a `Layer` for the implementation:

```typescript
import { Context, Effect, Layer } from 'effect';

type AccessPolicy = {
  readonly decide: (userId: string) => Effect.Effect<AccessDecision, UserNotFound>;
};

export class AccessPolicyService extends Context.Service<
  AccessPolicyService,
  AccessPolicy
>()('app/AccessPolicyService') {}

export const AccessPolicyLive = Layer.sync(AccessPolicyService)(() => ({
  decide: (userId) => findAccessDecision(userId),
}));

export function checkUserAccess(userId: string) {
  return Effect.gen(function* () {
    const policy = yield* AccessPolicyService;
    return yield* policy.decide(userId);
  });
}
```

The component calls `checkUserAccess`; it does not call `AccessPolicyService`
and does not know which Layer implements it.

When a Craft factory genuinely needs a service member, narrow it explicitly with
`effectService` rather than resolving an untracked value:

```typescript
import { effectService } from '@craft-ts/effect';

const { decide } = yield* effectService(
  AccessPolicyService,
  ({ decide }) => ({ decide }),
);
```

Prefer exposing a domain operation such as `checkUserAccess` to a component. The
selector form is useful for a Craft service or adapter that deliberately owns
the boundary and wants the graph to record only the members it uses.

## Derive Craft state from the Effect service

`craftComputed` stays synchronous: it derives a Craft reader. Let
`queryEffect` execute the Effect operation, then derive a display value from the
query resource:

```typescript
import { craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';

const accessQuery = yield* queryEffect('accessQuery', {
  params: () => 'user-ada',
  loader: ({ params }) => checkUserAccess(params),
});

const accessLabel = craftComputed('accessLabel', function* () {
  return (yield* accessQuery.value())?.label ?? 'Loading…';
});
```

The chain is: `queryEffect` runs `checkUserAccess`, the active `Layer` provides
`AccessPolicyService`, and `accessLabel` reacts to the query's Craft value. The
computed does not call the Effect service or start an Effect itself.

## Declare a synchronous member

That last sentence used to be a hard rule: no Effect at all inside `params`,
`craftComputed(...)` or `craftMethod(...)`. Those run on Craft's **synchronous**
driver, which completes on one tick and cannot wait — and `Effect<A, E, R>` does
not say whether running it will suspend.

It is worse than it looks for a service member. A `Layer` closes over the
member's dependencies when it builds the service, so a member that calls the
network and a member that adds two numbers *both* surface as `R = never`:

<<< @/tests/snippets/learn-effect/sync-members.spec.ts#domain

The information does not exist in the type, so you write it there. `SyncOp` is a
phantom requirement — never provided, no runtime cost — and `R` is the one
channel Effect accumulates across composition. An Effect that requires `SyncOp`
is one its author declares never suspends.

Requirements union through `Effect.gen`, so the declaration propagates on its
own. A standalone program that only calls declared-synchronous members inherits
the marker; one that calls nothing marked spells it out with `yield* SyncOp`:

<<< @/tests/snippets/learn-effect/sync-members.spec.ts#standalone

`CartPricing` in `R` is not a problem: the level in force satisfies it, exactly
as it does for a loader. The only thing checked is that `SyncOp` is among the
requirements.

## Run it with syncEffect

`syncEffect(...)` is the door. It runs the program in place — no suspension, no
promise — so it can go where `runEffect` cannot:

<<< @/tests/snippets/learn-effect/sync-members.spec.ts#component

Anything nobody declared synchronous is refused at the call, before anything
runs:

<<< @/tests/snippets/learn-effect/sync-members.spec.ts#refused

::: tip Three lines of defence

`SyncOp` is a claim, not a proof — nothing stops a body from declaring itself
synchronous and awaiting anyway. Three mechanisms check it, and none is
redundant:

1. **the type** — `syncEffect(...)` refuses an Effect nobody declared, at the
   call site;
2. **`craft-ts/sync-effect-body`** — reads the body, every branch at once, and
   rejects a declared-synchronous body that yields something async. A unit test
   cannot do this: it only proves the inputs it was given;
3. **the runtime** — `syncEffect` runs through `Effect.runSyncExitWith`, which
   cannot suspend. A broken declaration throws `CraftEffectNotSynchronous`
   immediately, at the first call, instead of freezing the UI.

:::

Keep asynchronous work where it belongs: a loader. `SyncOp` opens one narrow,
explicit door for business calculations, not a way around the adapters.

## Run a standalone Effect

For a low-level bridge, `runEffect` lets a Craft generator yield an Effect while
preserving its typed error channel:

```typescript
import { Effect } from 'effect';
import { runEffect } from '@craft-ts/effect';

const name = yield* runEffect(Effect.succeed('Ada'));
```

Use the adapters in the next chapters for application data. They resolve the
Effect requirement `R` through the nearest `provideLayer(...)` and keep loading,
value and exception state in the Craft resource.

## Install the bridge once

The bridge teaches Craft how to execute a yielded Effect. Install it during app
bootstrap, not in every loader:

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

In tests, call `installCraftEffectBridge()` in `beforeEach` and dispose the
returned function in `afterEach`.

## What you gained

An Effect domain with typed failures, explicit service requirements and swappable
Layers. The next step puts that program behind a reactive `queryEffect`.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 2. Derive UI state](/learn-effect/02-derive)

[4. Load data with Effect →](/learn-effect/04-load-data)

</div>
