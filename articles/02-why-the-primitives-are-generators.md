---
title: 'Your Angular dependency graph is invisible. Generators are how I made the compiler see it.'
published: false
description: 'inject() tells the type system nothing about what a service needs. This is what changes when every dependency goes through yield* instead — and what it costs.'
tags: angular, typescript, webdev, testing
series: 'Building craft-ts'
canonical_url: ''
cover_image: ''
---

In [the first article](#) I showed a craft-ts service and asked you to look past the one thing that probably bothered you:

```typescript
const tasks = yield* query('tasksQuery', {
  params: () => ({ done: filter.done() }),
  loader: function* ({ params }) {
    return yield* TaskApi.list(params);
  },
});
```

`function*`. `yield*`. In an Angular service.

That is the single most unusual decision in the library, and it is fair to be suspicious of it. Unfamiliar syntax needs to earn its place, and "it looks like Effect" is not a reason — it is a coincidence of shape until someone explains what the shape buys.

So here is what it buys.

## The problem: `inject()` tells the type system nothing

Take a perfectly ordinary Angular service:

```typescript
@Injectable({ providedIn: 'root' })
export class TaskList {
  private api = inject(TaskApi);
  private logger = inject(Logger);
  // …
}
```

Now answer these three questions **without opening the file**:

1. What does `TaskList` depend on?
2. If I render it in a route that forgot a provider, when do I find out?
3. In a test, what exactly do I have to mock?

You cannot answer any of them from the type. `TaskList` is a class whose type is its public API, and its public API says nothing about `TaskApi` or `Logger`. The dependencies were resolved by a runtime lookup that leaves no trace in the type system.

The consequences are the everyday friction of large Angular apps:

- **A missing provider is a runtime error**, discovered in the browser, on the route, sometimes only on the route that one QA person visits.
- **Tests are written by guessing.** You run the test, read `NullInjectorError`, add a provider, run again. You are not describing the graph — you are bisecting it.
- **Refactors rot silently.** Add an `inject()` to a service used in twelve places and nothing turns red. The twelve call sites are unchanged, the type is unchanged, and the failure shows up somewhere else entirely.

None of this is Angular being careless. `inject()` is a runtime lookup by design, and that design is what makes it so flexible. But flexibility here means the graph exists only while the app runs, and nothing before that can reason about it.

I wanted the graph to be a **type**.

## What a generator actually gives you

A generator is a function that can hand control back to whoever called it, mid-execution, and receive a value in return. That is the whole mechanism. `yield*` delegates to another generator and gives you back its result.

Which means a generator body has something a normal function body does not: **a channel to its caller**.

craft-ts uses that channel for exactly one thing. Every `yield*` is a service or a primitive saying *"I need this"*, and a driver on the other side resolves it:

```typescript
const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* () {
    const api = yield* TaskApi(); // tracked
    const tasks = yield* state('tasks', []); // tracked
    return tasks;
  },
);
```

Same dependencies as the class above. The difference is that here they went *through* something. The factory is a generator, so every dependency it needs had to pass through `yield*` to get in — and TypeScript, following the generator's `Yielded` type, records every one of them.

The graph is no longer a runtime fact. It is part of `TaskList`'s type.

## What that unlocks

### The compiler catches the missing provider

Because a route knows the full dependency set of what it renders, providing that set becomes a type obligation rather than a hope. Forget one, and the route stops compiling — before the browser, before QA, before the demo.

### Tests describe the graph instead of discovering it

This is the payoff I did not anticipate when I started, and it is now my favourite part.

Most test setups let you forget a dependency and find out at runtime. craft-ts inverts it: you hand over a **register** covering the whole graph, and the compiler refuses to run the test until every node is accounted for.

```typescript
const { sut, mocks } = await setupCraftServiceTestingByRegister(
  CounterConsumer,
  {
    CounterConsumer: provideCounterConsumer(),
    Counter: {
      $self: vi.fn(() => 41),
      increment: vi.fn(),
    },
  },
);

expect(sut.read()).toBe(41);
sut.increment();
expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
```

Each node is `'real'`, a real provider, a mock object, or explicitly `'notReached'`. That last one is the interesting one: **"this service exists in the graph and I am asserting it is never touched"** is a claim you can now write down, and the compiler will hold you to it.

There is no `NullInjectorError` loop, because there is nothing to discover. And when someone adds a dependency to a service six months from now, your test file goes red at the register — the one place that is supposed to know.

### Precision, because you yield what you use

A yield records exactly what it asked for. So this:

```typescript
const api = yield* TaskApi();
```

records the whole service, while this:

```typescript
const updateUser = yield* UsersApi.updateUser();
```

records one property. In the first article, the loader called `TaskApi.list(params)` directly — same idea, one property, one node in the graph.

That difference lands directly in your test register: a service that yielded one property needs one property mocked. Precise yields are what keep these tests three lines instead of thirty.

### You start actually using dependency injection

This is the effect I did not see coming, and it may be the most important one.

Angular has one of the best dependency injection systems in front-end development. Hierarchical injectors, providers scoped to a route, an abstract service with a different implementation per context, an instance per feature rather than one global singleton. It is all there, it has been there for years.

And most codebases I have seen use almost none of it. What they use is `providedIn: 'root'` and `inject()` — one global singleton per service, everywhere, forever.

I used to read that as laziness. I now think it was a rational response to risk. Every step beyond the global singleton makes the invisible graph harder to hold in your head: one more place a provider can be missing, one more implicit contract nobody can see from the type, one more test setup you build by trial and error. The sophisticated pattern was better in theory and more dangerous in practice, so teams — correctly — took the boring option.

Take the risk away and the calculation inverts. When forgetting a provider is a compile error, scoping a service to a route costs nothing to get right. Neither does an abstract service resolved differently per context, or a per-feature instance holding per-feature state. These stop being patterns you argue about in a design review and become the obvious thing to reach for, because the compiler is doing the bookkeeping that used to be yours.

That is the part I find genuinely interesting. The goal was to make the existing graph visible. What actually happened is that I started building richer graphs — not because the library added a feature, but because a class of risk stopped existing.

It also opened the door to patterns I would not have dared ship otherwise: providers declared and typed at the route level, abstract services whose implementation is chosen per context, state that belongs to a feature's injector rather than to a global singleton. Each of them deserves its own article, and they are coming later in this series. For now the point is only that they became *available* — the safety is what made them worth reaching for.

## The honest costs

I would rather you hear these from me than discover them on day two.

**It is unfamiliar, and unfamiliar is expensive.** Every developer joining your project meets `function*` on the first file they open. The rule is mercifully short — *inside a craft factory, drive everything with `yield*`* — but it is still a rule to teach, and a code review reflex to build.

**Type-checking is slower, and that one is on me.** Everything above has a price paid in the type system: a dependency yielded at the bottom of the graph has to travel up through every layer that composes it, and each layer widens a union the compiler then has to keep resolving. On a deep graph you feel it — in `tsc`, and in your editor, which is worse. This is the sharpest edge of the library today. It is also the area I am actively working on, because "the compiler knows your graph" stops being a feature the moment the compiler takes eight seconds to say so. If you hit it, an issue with a reproduction is genuinely the most useful thing you can send me.

**A primitive invocation is single-use.** Each call produces one generator, to be consumed exactly once. Store one and `yield*` it twice and you get a bug that reads like a reactivity problem but is not.

**You cannot mix in `inject()`.** It works at runtime, and that is precisely the trap: the dependency is invisible to every check that makes this worth doing. The graph is silently wrong, the test register is silently incomplete, and nothing complains. There is a `craft-ts/no-angular-inject` ESLint rule for exactly this reason, and if you adopt the library you should turn it on immediately.

**Angular classes are still Angular classes.** In a `@Component` class there is no generator to yield from, so `craftUse(...)` drives a primitive from a class field instead. It works — it is the interop path — but a class field is the end of the graph, so there is nothing left to track past that point. Interop, not a second way of doing things.

## Where the idea comes from

I said it in the first article and it bears repeating: this comes from [Effect](https://effect.website). Generators as a way to get `async/await` ergonomics over something that is not a promise, and a type that carries what a computation *requires* rather than hiding it — both are theirs.

What craft-ts takes is narrow on purpose. There is no runtime to adopt, no fibers, no `Layer`. The values are not wrapped: `tasks.value()` is a `Task[] | undefined` you read from an Angular template like any other signal. The generator is used for one job — making dependencies visible — and then it gets out of the way.

## So, is it worth it?

Here is the trade, stated as plainly as I can:

**You pay** two characters, one unfamiliar keyword, a rule to teach every newcomer, and — today — type-checking time on deep graphs.

**You get** a dependency graph the compiler can check, and tests that describe that graph exhaustively instead of bisecting it.

Above all, you get this: **you can no longer forget to provide a service and find out in production.** Not on the rarely-visited route, not in the lazy-loaded module nobody opened during QA, not in the Sentry alert on Friday evening. A missing provider stops being a class of runtime incident and becomes a red squiggle in your editor, in the file you are already looking at. That failure mode is not mitigated — it is gone, because the graph is checked before the app ever runs.

I think that trade is worth it. I also think it is genuinely arguable, and that the people most likely to disagree are the ones who have shipped the largest Angular apps — which is exactly why I would rather have the argument now, while the API can still change.

**So: is an invisible dependency graph a real problem in your projects, or one you stopped noticing?** I am curious whether the `NullInjectorError` loop reads as "annoying but fine" or as "yes, that, every week" — the answer changes how hard I should push this idea.

Next in this series: **typed dependency injection end to end** — `craftService`, adapting the Angular services you already have, and what the route-level check actually verifies.

---

*This article was co-written with Claude. The library, the design decisions and the opinions are mine.*
