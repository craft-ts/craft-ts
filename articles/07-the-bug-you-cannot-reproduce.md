---
title: 'The bug you cannot reproduce: what if the app told you everything it was holding?'
published: false
description: 'A stack trace says where it broke, never why. When every dependency flows through one channel, that channel becomes the place to capture app state, correlate a failure back to the click that caused it, and trace every render and request.'
tags: angular, typescript, webdev, debugging
series: 'Building craft-ts'
canonical_url: ''
cover_image: ''
---

You open the error tracker on Monday. One issue, 412 occurrences, 38 users.

```
TypeError: Cannot read properties of undefined (reading 'id')
  at TaskList.selected (task-list.ts:47)
```

Line 47 is fine. You have read it four times. It is fine.

What you actually need is everything the stack trace does not contain: what the user clicked, what the app was holding at that instant, which request came back weird, and whether the two things that look unrelated in the logs are in fact the same story four seconds apart.

So you add logs. Ship them. Wait a week. Get logs that tell you the thing you already suspected and not the thing you needed. This loop is, in my experience, where most of the real time goes on a mature product — not writing features, but reconstructing the past from insufficient evidence.

This article is about the payoff I did not design for and now like the most.

## The accident that turned out to be the point

Four articles ago I argued that every dependency should flow through `yield*` so the compiler can see the graph. That was the goal: type safety.

The side effect is that **everything now goes through one channel.** Every service resolution, every method, every query loader, every effect — one system resolves them all. And a single choke point is the one thing you need to cross-cut an entire application without touching a line of business code.

That is what observability in craft-ts is: not a logging library, but a use of the channel that was already there.

## Two kinds of failure, and only one of them is this article

The library draws a line I have found clarifying:

- **Expected failures** are `craftException` values — the 403, the taken email, the empty report. They are declared, typed, and handled. Articles [one](#) and [four](#) were about those.
- **Unexpected errors** are bugs. They are supposed to be impossible. The interesting property of an impossible thing that just happened is that **it should never happen again** — which means the moment it occurs is the one moment you can afford to be greedy about context.

Everything below is for the second kind.

## One wrapper around every crafted function

`provideFnWrapper` wraps **every** generator-based function craft-ts executes — services, methods, queries, mutations, effects:

```ts
provideFnWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (factory, thisArg, args) {
    try {
      return yield* factory.apply(thisArg, args);
    } catch (error) {
      yield* Console.error(error);
      throw error;
    }
  },
);
```

Registered once in the app config. No decorator on your services, no base class, no manual instrumentation to forget on the one service that later turns out to matter. Multiple wrappers compose, outermost first.

The string as a first argument is not decoration — it is a warning the API forces you to acknowledge, and I will come back to it, because it is the one place in this library where the type-safety promise deliberately does not hold.

## The app snapshot: what was it holding?

This is the piece I would sell hardest.

```ts
provideTakeAppSnapshot((reports) => {
  fetch('/api/incident', { method: 'POST', body: JSON.stringify({ reports }) });
});
```

When an unexpected error bubbles up, this captures **every active state in the application** at that instant. Each report carries:

- `source` — the host tag of the state,
- `from` — the ancestry chain that produced it,
- `state` — the actual current value.

Read that list again with the Monday morning bug in mind. Not "an undefined was read at line 47", but: *these forty states existed, here is what each one held, and here is which service produced each.* The undefined stops being a mystery and becomes an entry in a list.

You do not call it. It registers its own wrapper and fires on unexpected errors — which matters, because the failure mode of manual instrumentation is that the crash happens in the one place nobody instrumented.

## Correlation: linking the crash to the click

The other half of the reconstruction problem is causality. Logs are a flat list; what you want is a tree rooted at a human gesture.

```ts
provideCorrelationIdTracking();
```

When a template action runs, an id is generated **from its location** — `SavePanel:button:save:click:uuid`. Navigations produce `nav-back:uuid` and `nav-forward:uuid`. Every generator invoked downstream, directly or transitively, synchronously or four seconds later, captures that id at invocation time.

Boundaries like `Console` then carry it in their metadata, so one `yield* Console.error(...)` ships:

- `startCorrelationId` — the id when the current generator was invoked,
- `lastCorrelationId` — the most recent id observed,
- `mayCorrelatedIds` — the chain it can be linked to.

Which means you can reconstruct, from logs alone, the sentence you actually wanted: *"the user clicked Save, and the third sub-request that click triggered returned 500 four seconds later."*

Note the id contains the interaction's location. You are not correlating opaque uuids and hoping — the root of the chain names the button.

Combined with the snapshot, an unexpected error gives you the stack, every active state, and the causal chain back to the gesture. That is a bug report you can act on without a reproduction.

## And the rest of the surface

The same idea, applied at each boundary that matters:

| Provider | What it wraps | Useful for |
|---|---|---|
| `provideTemplateTrace` | every effective render — components, blocks, projections, defer branches | finding what actually re-renders, and how often |
| `provideCraftRouterTrace` | Angular navigation plus the craft `match` / `guard` / `resolve` stages | slow or looping navigations, guard re-evaluation |
| `provideCraftHttpTrace` | each `CraftHttpClient` request, after method and URL are built | timing, request logging, redaction |
| `provideCraftDomEventHook` | every DOM action declared in a craft template | analytics, authorization, blocking an action |

The render one deserves a note: it reports the render unit, its phase (`create`, `initialRender`, `update`, `destroy`) and the owning component's `renderCount`. "Why does this list re-render on every keystroke" becomes a measurement instead of an afternoon with the profiler.

The DOM hook composes in registration order and can decline to call `next()`, which makes it an authorization point as much as a tracing one.

## What this costs

**Inside the wrapper, DI is not type-safe — and the library says so out loud.** This is the one place the whole series' promise is deliberately suspended, so it deserves plain language. The wrapper body runs in the injection context **where the error was raised**, not where the wrapper was declared. That is exactly what makes it powerful: you can yield browser boundaries and read the offending service's own metadata. It is also why craft-ts cannot prove the dependency you ask for is provided there. The mandatory warning string is the API refusing to let you adopt this accidentally. Keep wrappers to side effects — logging, metrics, snapshots — and out of business logic.

**A snapshot is your entire application state leaving the browser.** Nobody's documentation says this loudly enough, including mine: that payload can contain personal data, tokens, draft content. If you ship it to a third party, that is a decision with legal weight, and it needs redaction and a retention policy before it needs a dashboard. The capability is genuinely useful and genuinely dangerous, in proportion.

**It only sees what goes through the channel.** An `inject()` smuggled into a craft factory is invisible to the wrapper for the same reason it is invisible to the compiler — the [ESLint rule](#) from article two is doing double duty here.

**Wrapping everything has a cost.** A wrapper around every crafted function is a real overhead, and template tracing runs synchronously around every render. These are production-capable, not free; measure before you enable all of them everywhere.

## The question

The bet is that **observability should be a property of the architecture, not a library you bolt on.** Because dependencies flow through one system, cross-cutting them is a provider, not a refactor.

The counter-argument is decentralisation: an app-wide wrapper is a single point where a mistake affects everything, and "it goes through one channel" is also "one channel to break".

**When you last chased a bug you could not reproduce, what would actually have saved you?** The full state dump, the causal chain back to the click, the render trace — or something none of this captures? I built the greedy version because greedy is cheap at the moment of an impossible failure. I would like to know whether that is the right instinct or just mine.

Next in this series: **craft programs** — `.pipe`, `catchTag`, `retry`, and error handling whose exhaustiveness is checked at compile time.

---

*This article was co-written with Claude. The library, the design decisions and the opinions are mine.*
