---
title: 'What does your passing Angular test actually prove?'
published: false
description: 'Mock-heavy unit tests keep passing after the thing they mock has changed. Here is what testing looks like when the compiler makes you account for the whole dependency graph, and lets you keep it real.'
tags: angular, typescript, testing, webdev
series: 'Building craft-ts'
canonical_url: ''
cover_image: ''
---

Here is a test I have written, reviewed and approved more times than I would like:

```typescript
TestBed.configureTestingModule({
  providers: [
    { provide: TaskApi, useValue: { list: () => of([{ id: '1' }]) } },
    { provide: Logger, useValue: { log: vi.fn() } },
  ],
});

const service = TestBed.inject(TaskList);
expect(service.tasks().length).toBe(1);
```

It is green. It runs in nine milliseconds. And I want to ask an uncomfortable question about it:

**What did it prove?**

It proved that `TaskList` reads whatever `TaskApi.list()` returns. It did not prove that `TaskApi.list()` returns anything of that shape — that was my assumption, written by me, frozen in a mock. The day someone changes `list()` to return `{ items: Task[] }`, this test keeps passing, in perpetuity, describing an API that no longer exists.

Mock-heavy tests have a specific failure mode: **they are most confident exactly where they know least.** And the effort you spent writing them is spent maintaining your own guesses.

There is a second, smaller annoyance underneath. How did I know to provide `TaskApi` and `Logger` in the first place? I ran the test, read `NullInjectorError`, added a provider, ran it again. I did not describe the dependency graph — I bisected it, by hand, one failure at a time.

Both problems have the same root: **the test setup and the real graph are two separate things that happen to be similar today.**

## The register: account for every node

craft-ts's answer starts by inverting the discovery loop. You supply a **register** covering the service's whole dependency graph, and the compiler refuses to run the test until every node has an entry:

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

There is no `NullInjectorError` loop, because there is nothing to discover. The graph came from the types — the same types that made it visible in [the article on generators](#) — so the test is *reading* the dependency graph rather than guessing at it.

Each node takes one of four decisions:

| Entry | Meaning |
|---|---|
| `'real'` | use the actual implementation |
| `provideX(...)` | the real provider, for `toProvide` scopes |
| a plain object | mock this service's public shape |
| `'notReached'` | this branch is never touched |

`'notReached'` is the one I did not expect to care about. It is not a shrug — it is an **assertion**. You are stating that a whole branch of the graph is unreachable in this scenario, and if that ever stops being true, the test tells you. That claim had no home in a `TestBed` setup; the closest equivalent was leaving a provider out and hoping the absence meant something.

The return value keeps the distinction honest too: `mocks` contains **only** what you actually mocked. Nothing marked `'real'`, `'notReached'` or provided for real shows up there, so a test cannot quietly assert against something it decided to keep real.

## The failure mode this fixes

Six months from now, someone adds a dependency to a service three levels down your graph.

In the `TestBed` world, nothing happens. Your test still compiles, still passes, and now covers a graph that no longer resembles production. You find out later, in a way that will not obviously point back here.

With an exhaustive register, that test file goes red — at the register, which is the one place whose job is to know the shape of the graph. The failure is a compile error in a file that is already about dependencies, and fixing it is a decision: is this new node real, mocked, or unreachable?

That is the difference between a test that decays silently and one that asks you a question.

## The mode I would actually recommend: `boundaryOnly`

Everything above still lets you mock the whole world if you want to. So here is the part I would put first if I were writing the docs again.

`boundaryOnly` keeps the **entire application graph real**, and only lets you decide what happens at the browser and platform edges:

```typescript
const { sut, mocks } = await setupCraftServiceTestingByRegister.boundaryOnly(
  Dashboard,
  {
    toProvideRegister: {
      Dashboard: provideDashboard(),
      FeatureConfig: provideFeatureConfig({ env: 'test' }),
    },
    boundaryRegister: {
      LocalStorageService: { getItem: vi.fn(() => 'cached') },
      ConsoleService: 'real',
    },
  },
);
```

Non-boundary services **cannot** be mocked in this mode. Your real services call your real services; only `localStorage`, `navigator`, the network and their siblings are replaced.

That constraint is the whole point. A test written this way fails when your code is wrong, rather than when your mock has drifted — and when it passes, the thing it exercised is the thing that ships.

## Why that requires boundaries to be first-class

`boundaryOnly` only works because the platform is not reachable by accident. A craft service does not call `localStorage.getItem` directly; it goes through `LocalStorage`, a service marked as a browser boundary, which means the dependency is **in the graph** like any other.

That is what makes "replace exactly the edges, and nothing else" expressible at all. In a codebase where any service can reach for `window` at any depth, there is no line to draw — you cannot mock the boundary because the boundary is not a thing, it is a habit.

The same applies to the network, which is why `CraftHttpClient` has shown up in every article in this series: an HTTP call is a boundary too, and being one is what lets a test keep the whole graph real and still control what the server said.

There is one more explicitness rule worth knowing, because it catches people: a reachable real service with an app-start hook must be acknowledged.

```typescript
{
  appStart: {
    AuthSession: 'run',   // actually run its onAppStart hook
    Analytics: 'ignore',  // deliberately skipped, and it says so
  },
}
```

`'ignore'` is a comment the compiler enforces. "This test does not need analytics to boot" stops being an assumption living in someone's head.

## What this costs

**Registers are verbose.** A service with a wide graph produces a long register, and there is no getting around it — exhaustiveness means writing every node down. On a large graph, the first reaction is usually "this is a lot of ceremony for one assertion", and that reaction is fair.

**Every graph change touches test files.** This is the feature and the friction at once. Adding a dependency makes several registers go red, and you will fix them mechanically. It is honest work, but it is work, and on a bad day it feels like the tests are managing you.

**`boundaryOnly` tests are slower.** Real graph, real wiring, real everything except the edges. Nine milliseconds becomes rather more than nine milliseconds. I think that is the right trade for the tests that matter, and I would not write every test this way.

**Type-checking cost, again.** Same trade-off named in article two, and registers are one of the places it concentrates: they are large structural types compared against a deep graph.

## The question

The bet here is that **exhaustiveness beats convenience** — that being forced to account for every node produces tests worth having, and that the ceremony pays for itself the first time a register goes red for a real reason.

I am aware that is a bet, and that there is a serious counter-argument: mocks are fast and local, most tests do not need to be true in that deep sense, and a test suite that fights you on every refactor is a test suite people start deleting.

**So — when a test of yours has failed for a real reason, what kind of test was it?** The isolated fast one, or the one that ran something closer to the real thing? I have a strong hunch about the answer, and a strong hunch is exactly the kind of thing that should be checked against people who did not build the library.

Next in this series: **observability** — correlation ids, exception capture, and being able to ask a running app what its state actually is.

---

*This article was co-written with Claude. The library, the design decisions and the opinions are mine.*
