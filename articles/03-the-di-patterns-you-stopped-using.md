---
title: 'The Angular DI patterns you stopped using — and what they look like when the compiler checks them'
published: false
description: 'Scoped instances, abstract contracts, providers built from the route itself. Angular has had all of it for years, and most codebases use none of it. Here is what changes when a missing provider is a compile error.'
tags: angular, typescript, webdev, architecture
series: 'Building craft-ng'
canonical_url: ''
cover_image: ''
---

At the end of [the last article](#) I made a claim I want to make good on.

Angular has one of the best dependency injection systems in front-end development — hierarchical injectors, providers scoped to a route, contracts resolved differently per context — and almost nobody uses it. What we use is `providedIn: 'root'` and `inject()`. One global singleton per service, everywhere, forever.

My argument was that this is not laziness. It is a rational response to an invisible graph: every step beyond the global singleton adds a place where a provider can be missing, and you find out in the browser. The sophisticated pattern was better in theory and riskier in practice, so teams took the boring option — correctly.

This article is the "and therefore what". Three patterns that become obvious once forgetting a provider is a compile error, in increasing order of how much I like them.

## 1. Stop defaulting to a global singleton

`providedIn: 'root'` is such a reflex that it barely reads as a decision. It is one, and it has a cost you have probably paid without attributing it: **the state outlives the thing it belongs to.**

You know the symptoms. You leave the edit screen with a validation error showing, come back, and the error is still there. A list keeps its filter from a previous, unrelated visit. Someone adds a `reset()` method, and now every consumer must remember to call it in `ngOnDestroy`. The bug is never in the feature — it is in the fact that the service is older than the feature.

In craft-ng, scope is the one decision you make when declaring a service, and the recommended default is inverted:

| Scope | Instances | Reach for it when |
|---|---|---|
| `function` | fresh per injection | a service owned by one component — **the default** |
| `toProvide` | one per mount, via `provideX()` | children or a route must share it |
| `global` | one, at root | genuinely app-wide state |
| `abstract` | none — a contract | the implementation depends on context |

Default to `function`; move up only when sharing forces you to. That advice is unremarkable in isolation — most architecture guides say something like it. What makes it *followable* is that moving to `toProvide` no longer means accepting runtime risk. The provider obligation is checked where the route is declared, so the narrow scope costs you nothing but a line, and the state dies with the feature that owns it.

## 2. Abstract services: the implementation belongs to the mounting site

Here is the pattern I think Angular developers under-use the most, and the one with the biggest gap between "possible" and "actually done".

An `abstract` service declares a contract and no implementation:

```typescript
import { abstract, craftService } from '@craft-ng/core';

type User = { name: string };

const { User, provideUser } = craftService(
  { name: 'User', scope: 'abstract' },
  abstract<User>(),
);
```

Anything downstream can now depend on `User()` without knowing where it comes from. The implementation is supplied at the mounting site — a route, a feature config, a test — with `provideUser`:

```typescript
const providers = [provideUser(() => ({ name: 'Ada' }))];
```

And the factory can be a generator, which is what makes it more than a fancy `useFactory`: everything it yields is tracked, so the provider itself participates in the dependency check like any other node.

```typescript
const providers = [
  provideUser(function* () {
    const greeting = yield* Greeting();
    return { name: `${greeting.prefix} Ada` };
  }),
];
```

The consequence worth dwelling on: **a service's implementation stops being a hard import.** A component that yields `User()` does not import a concrete class, does not know which one it gets, and cannot accidentally reach past the contract. Swapping the implementation per context is not a refactor — it is a different provider at a different mount.

Angular can do this today with `InjectionToken` and `useFactory`. What it cannot do is tell you at compile time that some route forgot to provide it. That single difference is the reason the pattern stayed a design-review talking point instead of a habit.

## 3. Providers built from the route itself

This is the one I find genuinely new, and it is where the previous two patterns pay off together.

Plenty of services depend on *which route rendered them*. A "current project" service on `/projects/:projectId`. A tenant-scoped API client. Anything whose identity comes from the URL rather than from the app.

The usual solution is a global singleton holding the current thing, populated by an effect subscribed to the router, and read by everyone else. It works, and it has a permanent flaw: **the service exists before the value does.** So the type is `Project | null`, every consumer handles a `null` that is only real for a few milliseconds during navigation, and someone eventually writes a non-null assertion that is right until it isn't.

`craftRoute(...).withProviders(...)` inverts it. The route builds the service from its own guarded data, params or query params — and the component downstream receives a value that already exists:

```typescript
export const { demoRoutes } = craftRoutes('demo', [
  craftRoute('query/:userId', {
    componentDeps: {} as import('./query').GenDeps_GlobalQuery,
    loadComponent: ({ withRetry }) => withRetry(import('./query')),
    canActivate: function* () {
      const auth = yield* Auth();
      const user = auth.value();
      return user ?? false; // the resolved user becomes the route's guarded data
    },
  }).withProviders(({ GuardedData }) => [
    provideUser(function* () {
      const guarded = yield* GuardedData(); // Signal<User>
      return guarded();
    }),
  ]),
]);
```

Read the chain: the guard resolves a user, or the route does not activate. Whatever it returned becomes the route's **guarded data**. The provider builds the `User` contract from it. The routed component yields `User()` and gets a value.

Not `User | null`. Not a value that arrives later. If the route rendered, the user exists — that is what the guard *means*, and here the type finally says so.

The callback receives one helper per token the route actually has, under route-local names:

| Helper | Present when… | Yields |
|---|---|---|
| `GuardedData` | the route has `canActivate` | `Signal<GuardData>` |
| `<Param>Params` | per path param | `Signal<string>` — e.g. `UserIdParams` |
| `QueryParams` | the route has `queryParams` | the query-params state |
| `Data` | the route has `data` | `Signal<RouteData>` |

They are generators, so you consume them with `yield*` like anything else, and combine them freely:

```typescript
.withProviders(({ UserIdParams, QueryParams }) => [
  provideSomething(function* () {
    const userId = yield* UserIdParams();
    const qp = yield* QueryParams();
    return { userId, qp };
  }),
])
```

What I like about this is not the ergonomics. It is that a whole category of defensive code disappears — the null checks, the "is it loaded yet" flags, the effect that syncs a singleton with the router — and it disappears because the value's lifetime now matches the route's lifetime, rather than being managed on top of it.

## What this costs

**Three scopes to think about instead of one.** `providedIn: 'root'` required no thought; this requires a small one at every service. It is a real tax, paid at declaration time, on every service you write.

**Abstract services add indirection.** A contract with no implementation in sight is harder to navigate: "go to definition" lands on the contract, not on the code that runs. When the implementation never actually varies, that indirection buys you nothing — use a concrete service.

**The guarantee is only as wide as the check.** Route providers are compile-checked because the route check covers that subtree. On a route that is not covered, you are back to Angular's runtime behaviour, with more machinery than you started with. The patterns and the check are one package, not two features.

**And the type-checking cost from last time applies here too.** Each of these patterns adds nodes the compiler has to resolve. It is the same trade-off, and the same active work item.

## The question

I am fairly confident about the mechanics. I am much less confident about what people actually want.

**Has an invisible-provider risk ever stopped you from doing the architecturally better thing?** I am claiming that it has — that we all reach for the root singleton partly because the alternatives were unsafe, not because they were wrong. But I built the tool, which is the worst possible position from which to judge whether the problem is real.

If your answer is "no, I use root singletons because they are simply simpler and I have never regretted it", that is genuinely useful to me, and I would rather read it now than infer it from silence later.

Next in this series: **`query` and `mutation` in full** — reactive parameters, typed exceptions, and how a write invalidates a read without a global event bus.

---

*This article was co-written with Claude. The library, the design decisions and the opinions are mine.*
