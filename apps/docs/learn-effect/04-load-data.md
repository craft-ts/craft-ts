# 4. Load data with Effect

**Goal:** expose an `Effect<A, E, R>` as a Craft query.

## The operation being loaded

`queryEffect` receives a domain function that returns an Effect. Here is the
`loadUserProfile` used by the query below; the data is mocked so the example
can show each result channel:

```typescript
// profile-domain.ts
import { Data, Effect } from 'effect';

export type ProfileScenario =
  | 'success'
  | 'not-found'
  | 'session-expired'
  | 'database-down';

type Profile = { readonly name: string };

export class UserNotFound extends Data.TaggedError('UserNotFound')<{
  readonly userId: string;
}> {}

export class Unauthorized extends Data.TaggedError('Unauthorized')<{
  readonly reason: string;
}> {}

export function loadUserProfile(scenario: ProfileScenario) {
  return Effect.gen(function* () {
    // Simulate the latency of a backend request.
    yield* Effect.sleep('400 millis');

    switch (scenario) {
      case 'not-found':
        return yield* new UserNotFound({ userId: 'user-404' });
      case 'session-expired':
        return yield* new Unauthorized({ reason: 'session expired' });
      case 'database-down':
        return yield* Effect.die(new Error('database unavailable'));
      case 'success':
        return { name: 'Ada Lovelace' } satisfies Profile;
    }
  });
}
```

`loadUserProfile` does not run when it is declared. It returns an
`Effect<Profile, UserNotFound | Unauthorized>`, which represents a backend
request and which the query runs whenever its parameters trigger the loader.

## `queryEffect`

The adapter has the same lifecycle as `query`, but its loader returns an Effect:

```typescript
import {
  type Input,
  craftComponent,
  ifNode,
  matchNode,
  p,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { loadUserProfile, type ProfileScenario } from './profile-domain';

const Profile = craftComponent(
  'Profile',
  {},
  function* (profileScenarioInput: Input<ProfileScenario>) {
    const profile = yield* queryEffect(
      'profile',
      {
        params: profileScenarioInput,
        loader: ({ params }) => loadUserProfile(params),
      },
      ({ resource, exceptions }) => ({
        hasProfile: craftComputed('hasProfile', () => resource.hasValue()),
        currentError: craftComputed('currentError', function* () {
          return (yield* exceptions()).loader;
        }),
      }),
    );

    return { profile };
  },
  ({ profile }) => [
    ifNode(profile.isLoading, () => p('Loading…')),
    /* bind profile.value() or match profile.exceptions().loader here */
  ],
);
```

`queryEffect` is a Craft query with an Effect loader. It owns cancellation,
loading state, the last value and typed exceptions. Its `Effect` requirements are
resolved by the active Layer. Here, `profileScenarioInput` is the reactive input
source: changing it reruns `loadUserProfile`; there is no `method` or manual
`profile.call(...)` because the input drives the query.

## The three result channels

| Effect outcome             | Craft outcome                                      |
| -------------------------- | -------------------------------------------------- |
| `Effect.succeed(value)`    | query value; the generator resumes with `value`    |
| typed `Effect.fail(error)` | Craft exception keyed by `error._tag`              |
| `Effect.die(defect)`       | technical resource error, not a business exception |

Interruption is cancellation. It does not become a user-facing exception.

Handle typed errors exhaustively with `matchNode.exhaustive` or with a route
exception handler:

```typescript
matchNode.exhaustive(profile.exception, '_tag', {
  UserNotFound: () => p('No profile matches that user.'),
  Unauthorized: () => p('Your session has expired.'),
});
```

When the Effect is used in a route guard or resolver directly, prefer
`yield* runEffect(program)`. A bare `yield* program` executes at runtime but
does not advertise `E` to Craft's compile-time route exception analysis.

## Reactive Effect computations

When the derived value comes from an Effect that **cannot suspend**, use
`computedEffect`. It is the Effect counterpart of `craftComputed`, and the
symmetry is the contract:

```
craftComputed : computedEffect  ::  query : queryEffect
```

```typescript
import { computedEffect } from '@craft-ts/effect';

const totalLabel = computedEffect('totalLabel', function* () {
  const lines = yield* cartLines();
  return cartTotalLabel(lines); // returns the Effect, never runs it
});
```

The factory reads Craft dependencies with `yield*` and **returns** an Effect;
`computedEffect` runs it in place against the nearest `provideLayer(...)`. The
result is a plain reactive value — no `value`, no `isLoading`, no `settled(...)`,
no `pendingNode`. Read it like any `craftComputed`.

Which is why the Effect must be declared synchronous with
[`SyncOp`](/learn-effect/03-effect-domain#declare-a-synchronous-member). A
computation is asked for its value now and cannot suspend to produce it, so an
Effect whose `R` does not carry `SyncOp` is refused at the call site:

```typescript
computedEffect('profile', function* () {
  const userId = yield* currentUserId();
  return loadUserProfile(userId); // ✗ hits the network
  //     ^ Argument of type 'Effect<Profile, …, UserRepository>' is not
  //       assignable to '… & NotDeclaredSynchronous<UserRepository>'
});
```

That is not a gap: the suspending case is what `queryEffect` is for. A typed
failure remains fine — failing is not suspending, and it travels on Craft's
exception channel.

## Synchronous params and methods

The `params` factory remains synchronous: it may read Craft dependencies, and it
may run a declared-synchronous Effect through `syncEffect(...)`, but it must
never construct a suspending Effect — move that to the loader. A `method` only
maps its arguments to params; the loader is the only callback allowed to
suspend:

```typescript
const profile =
  yield *
  queryEffect('profile', {
    params: function* () {
      const input = yield* currentUserInput();
      return resolveProfileParams(input);
    },
    loader: ({ params }) => loadUserProfile(params),
  });

const profileByMethod =
  yield *
  queryEffect('profileByMethod', {
    method: (input: UserInput) => resolveProfileParams(input),
    loader: ({ params }) => loadUserProfile(params),
  });
```

The Effect ESLint rule rejects Effect values and Effect service reads inside
`params`, methods, `craftComputed(...)`, and `craftEffect(...)`, keeping the
query boundary synchronous and deterministic. Only the loader may return an
Effect.

For purely synchronous local state, use native Craft values and `state`; there
is intentionally no `stateEffect`:

```typescript
const request = yield * state('request', 'support');
```

Use Effect for computations, I/O and service dependencies.

## What you gained

Effect's typed result becomes a reactive Craft resource without a manual
subscription or signal conversion.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 3. Put the domain in Effect](/learn-effect/03-effect-domain)

[5. Write data with Effect →](/learn-effect/05-write-data)

</div>
