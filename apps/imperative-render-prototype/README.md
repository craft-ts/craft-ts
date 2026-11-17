# Imperative render experiment

Research fixture, **not a supported Craft API**. It asks whether a native keyed
table with owned Craft component islands improves on the optional lean compiler.
Run from the workspace root:

```sh
npm run perf:imperative:prototype
```

`IMPERATIVE_RUNS` defaults to 7. `IMPERATIVE_ROWS` defaults to `1000,5000`;
`IMPERATIVE_OUTPUT` defaults to `tmp/imperative-render`. Confirmation campaign:

```sh
IMPERATIVE_ROWS=5000,10000 npm run perf:imperative:prototype
```

Three production builds render the same table: runtime, lean compiler, and
manual keyed native rows. Each has three native cells per row, with an optional
fourth containing an **ordinary, uncompiled Craft component** for its Edit
button. The compiler report proves both row shapes compile in lean mode and the
buttons retain the generic renderer. The manual implementation uses one effect
and a Map of keyed row references; it explicitly patches changed cells, moves
retained rows, updates child inputs and destroys removed children.

`bridge.mjs` injects an experiment-only `prototypeMount` capability into the node
directive context **at build time**. Production library files remain unchanged.
It delegates to the real renderer using the directive's injector and a derived
identity; pending/exception/SSR context is inherited. Slots are released with
the directive and may also be explicitly released when a row is removed. Only
patching the same kind of child is supported in this experiment. This bridge is
not an implementation of a public slot API or its full lifecycle contract.

The harness checks matching DOM after stripping Craft metadata/comments, retained
row identity, changed input attributes,
clicks after reordering, insertion/filter/restoration, destruction of all button
owners, and removal of detached button listeners. Lifetime counters run in
separate contract navigations, **not in timed builds' component instances**.
SSR executes in Node without global window/document: HTML structure is compared,
text escaping and child cleanup are asserted, and two requests run concurrently.
Hydration is not implemented or claimed by this experiment. Native cells have no
individual replay/registry target, and locator/replay equivalence is not tested.

Timing navigations use fresh browser contexts, seeded interleaving, two warmup
loops and five measured loops. Reported mount is synchronous bootstrap; layout
is a subsequent forced layout; mountAndLayout is their per-navigation sum.
The two-animation-frame marker is an end-to-ready diagnostic, not paint/LCP.
Update timings include applying DOM mutations and a microtask, not the subsequent
layout/paint. JS heap is measured after the interaction sequence and explicit GC;
it does not measure total browser/native DOM memory.
The JSON contains every navigation, distributions, environment, base commit and
fixture source hashes. Fixed row shape, CPU/browser and ownership choices bound
the conclusions; the manual code also maintains the keyed diff itself.

Typecheck the fixture with `npx tsc -p apps/imperative-render-prototype/tsconfig.json`.
The [investigation report](../../docs/benchmarks/2026-11-17-imperative-rendering.md)
records the findings and the unimplemented contracts of a public API.
