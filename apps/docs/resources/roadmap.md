# Roadmap

@craft-ts/core is evolving through real-world usage, careful experimentation,
and feedback from the community. This roadmap describes the areas I am
currently planning to explore; it is intentionally not a promise of fixed
release dates.

## Near-term priorities

### SSR as a Craft host

SSR is a Craft deployment concern: serialize Craft trees to HTML at the runtime
boundary.
That work lives in a later compiler/host plan; this release does not ship a
product SSR renderer.

### Real-world integration and stability

I will continue integrating `@craft-ts/core` into projects so that I can
experiment with the different situations and constraints that applications
encounter in practice. This ongoing use should help uncover edge cases,
validate the API, and move the library towards the most stable version
possible.

I am also studying improvements that could make the codebase more robust. I
am open to suggestions, proposals, and discussions about changes that would
improve reliability, maintainability, or the developer experience.

## Type-safe design systems

Another area I am actively exploring is how to create a design system that is
as type-safe as possible. The aim is to make design-system APIs expressive and
safe to use while preserving a good development experience.

- Improve the type-level techniques used by the library so that they are more
  efficient. In particular, I want to reduce type compilation time and make
  the feedback loop faster for developers.

One current challenge is TypeScript's memory limitation. A very ambitious
type-level design can place a significant load on the TypeScript compiler, so
this constraint has to be considered alongside the benefits of stronger
inference.

If you have ideas for addressing this problem, I would be very happy to hear
them. Please feel free to share your opinions and suggestions. I am willing
to introduce utilities or adaptations where necessary to make promising
approaches compatible with the library and practical to use.

## Tooling for understanding changes

I also plan to create a precise dependency graph and a tool that can compare
two branches. The goal is to make the changes introduced by artificial
intelligence easier to inspect and understand, by providing a clearer view of
the affected dependencies and the differences between two versions of a
codebase.

I may also extend the dependency graph to represent complete paths through the
graph, making it possible to follow how a change propagates across the
codebase. This could provide a foundation for adding architecture tests and
architecture constraints directly to the same tooling, so that intended
dependencies and boundaries can be checked automatically.

I am also considering building DevTools for `@craft-ts/core`, although I am
not yet certain how valuable a traditional DevTools experience would be for
the library. If there are features or workflows you would find useful in this
area, please feel free to tell me about them.

Several of my current ideas are more AI-first: tools designed to help an AI
agent debug an application through WebMCP and observability, for example by
making runtime state, dependency relationships, and application events easier
to inspect and reason about. Feedback will help determine whether these ideas
should become part of a DevTools experience or evolve as separate tools.

## Typed streams (`@craft-ts/stream`)

A typed RxJS-like library built around the principles of `@craft-ts/core` now
exists: `CraftStream<A, Y>` is a cold push stream whose type accumulates the
service dependencies of its operators' handlers and the typed exceptions they
may raise — readable at the terminal, where `subscribe` refuses to compile
without a handler for every exception. See [Typed streams](/guide/reactivity/streams).

Delivered: the carrier and `.pipe` (up to 14 operators); per-value operators (`map`,
`filter`, `tap`, `scan`); selection (`take`, `skip`, `takeWhile`, `distinctUntilChanged`,
`startWith`, `pairwise`, `takeUntil`, `takeUntilDestroyed`); flattening (`switchMap`,
`exhaustMap`, `concatMap`, `mergeMap`); combination (`combineLatest`, `merge`, `zip`,
`race`, `withLatestFrom`); time (`debounce`, `throttle`, `delay`, `timeout`, `retry`,
`repeat`, `auditTime`); sources (`interval`, `timer`, `fromEvent`); grouping (`buffer`,
`bufferCount`, `bufferTime`, `bufferWhen`, `sample`, `groupBy`, `window`, `windowCount`,
`expand`); exceptions (`catchTag` and `.exhaustive`, `mapException`, `orElse`);
multicast (`share`, `shareReplay`); the terminals (`lastValueFrom`, `firstValueFrom`,
`toArray`, `runForEach`, `subscribe`, `streamSignal`); the Effect adapters
(`@craft-ts/stream-effect`); and the `craft-migrate-streams` codemod. Core no longer
depends on RxJS.

Also delivered: the everyday operators (`first`, `last`, `takeLast`, `reduce`, `skipWhile`,
`skipUntil`, `distinct`, `defaultIfEmpty`, `ignoreElements`, `endWith`, `finalize`,
`switchAll`/`mergeAll`/`concatAll`/`exhaustAll`, `concat`, `concatWith`, `mergeWith`,
`combineLatestWith`) and the creators `defer`, `throwError`, `never`. The codemod now also
moves `lastValueFrom`, `throwError` and `asyncScheduler`-taking calls over.

Also delivered: `materialize` / `dematerialize` (with a `'X'` notification for typed
exceptions), `observeOn` / `subscribeOn` (they hop onto the temporal runtime — craft's one
scheduler, so there is no scheduler argument), and the connectable family (`connectable`,
`publish`, `publishReplay`, `publishBehavior`, `multicast`, `refCount`). The codemod
translates all of them, dropping rxjs scheduler arguments with a review notice.

Also delivered: the creators `from` (a stream, a Subscribable, a Promise or an iterable),
`fromPromise`, `fromIterable`, `generate`, `bindCallback` / `bindNodeCallback` and `fromFetch`;
the codemod translates `from`, `scheduled`, `generate` (positional form included),
`bindCallback`, `fromFetch`, and a publish-family operator wherever it sits in a pipe.

Also delivered: `ajax` (`getJSON`, `get`, `post`, `put`, `patch`, `delete`, `AjaxError`) and
`webSocket` — stream-shaped network sources on `fetch` and the platform `WebSocket` — and the
`connect(selector, { connector })` operator, which is where the selector forms of `publish`,
`publishReplay` and `multicast` land. The codemod now also expands aliased and namespace
imports (renaming every reference), and wraps a `.pipe` receiver whose type it cannot
establish in `from(...)` with a review notice instead of refusing the file.

The codemod's one remaining boundary is the one every all-or-nothing migration has: a symbol
that is in none of its tables (a future rxjs export, a third-party operator) leaves the file
untouched, with a diagnostic naming the symbol — and an alias that clashes with another name
in the file, a namespace used as a plain value, or an operator taking a form that cannot be
expressed (a `publishReplay` with three arguments before its selector) do the same.

## Longer-term exploration: type-safe server functions

Further ahead, I am considering a server-function system built around the
same principles. The idea is to allow dependency injection in server
functions while keeping it fully type-safe.

Such a system could also allow the server function to depend on data supplied
by the front end. That data would be passed automatically and checked in a
type-safe way, so the contract between the client and the server remains
explicit and reliable from end to end.

This is an early exploration rather than a committed API. Feedback about the
design, the use cases, and the trade-offs would be especially valuable as the
idea develops.

## Share your ideas

The roadmap will evolve as these experiments produce results. If you have
feedback, use cases, or ideas for making `@craft-ts/core` more robust and
type-safe, please share them through [GitHub Discussions](https://github.com/craft-ts/craft-ts/discussions)
or [GitHub Issues](https://github.com/craft-ts/craft-ts/issues).
