# 4. Load data with Effect

**Goal:** expose an `Effect<A, E, R>` as a Craft query.

## `queryEffect`

The adapter has the same lifecycle as `query`, but its loader returns an Effect:

```typescript
import { craftComponent, button, div, ifBlock, matchBlock, p } from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { loadUserProfile, type ProfileScenario } from './profile-domain';

const Profile = craftComponent(
  'Profile',
  {},
  function* () {
    const profile = yield* queryEffect(
      'profile',
      {
        method: (scenario: ProfileScenario) => scenario,
        loader: ({ params }) => loadUserProfile(params),
      },
      ({ resource, exceptions }) => ({
        hasProfile: craftComputed('hasProfile', () => resource.hasValue()),
        currentError: craftComputed('currentError', function* () {
          return (yield* exceptions()).loader;
        }),
      }),
    );

    yield* profile.call('success');
    return { profile };
  },
  ({ profile }) => [
    button('load', { *click() { yield* profile.call('success'); } }, 'Load'),
    ifBlock(profile.isLoading, () => p('Loading…')),
    /* bind profile.value() or match profile.exceptions().loader here */
  ],
);
```

`queryEffect` is a Craft query with an Effect loader. It owns cancellation,
loading state, the last value and typed exceptions. Its `Effect` requirements are
resolved by the active Layer.

## The three result channels

| Effect outcome | Craft outcome |
| --- | --- |
| `Effect.succeed(value)` | query value; the generator resumes with `value` |
| typed `Effect.fail(error)` | Craft exception keyed by `error._tag` |
| `Effect.die(defect)` | technical resource error, not a business exception |

Interruption is cancellation. It does not become a user-facing exception.

Handle typed errors exhaustively with `matchBlock.exhaustive` or with a route
exception handler:

```typescript
matchBlock.exhaustive(
  profile.exception,
  '_tag',
  {
    UserNotFound: () => p('No profile matches that user.'),
    Unauthorized: () => p('Your session has expired.'),
  },
);
```

When the Effect is used in a route guard or resolver directly, prefer
`yield* runEffect(program)`. A bare `yield* program` executes at runtime but
does not advertise `E` to Craft's compile-time route exception analysis.

## Keep inputs synchronous

Query params are Craft values or sources. The Effect belongs in the loader:

```typescript
const team = yield* queryEffect('team', {
  params: () => 'support',
  loader: ({ params }) => loadTeamOverview(params),
});
```

There is intentionally no `stateEffect`. Use `state` for local reactive UI
state, and keep Effect for computations, I/O and service dependencies.

## What you gained

Effect's typed result becomes a reactive Craft resource without a manual
subscription or signal conversion.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 3. Put the domain in Effect](/learn-effect/03-effect-domain)

[5. Write data with Effect →](/learn-effect/05-write-data)

</div>
