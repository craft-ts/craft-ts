# Optional compiler benchmark

Run from the repository root:

```sh
npm run perf:compiler
```

This builds the **same application source in four variants** with production minification:

- `runtime`: no compiler plugin;
- `dom`: generated DOM factories, list specialization disabled;
- `compiled`: generated DOM and proven list specialization (plugin defaults);
- `clone`: the same compiler with native blueprint cloning enabled.

No benchmark-specific purity marker or
runtime patch is added to the application. The harness compares DOM after
mount, individual/tenth updates, reversal, filtering and restoration; checks
retained keyed elements and destruction; and proves that one field change
reads exactly one of 128 independent bindings. Counters run separately from
timing navigations.

Default measurement: seven fresh browser contexts per case, seeded randomized
order, 100/1,000/5,000 rows, five action loops after two warmups. JSON includes
all samples, min/median/max, heap after GC, minified/gzip bundle bytes, build
cost, compiler coverage, CPU/browser/Node versions source revision and SHA-256 fingerprints of the measured sources.

- `rows`, `indexed`: ordinary list components, with and without reactive index.
- `fields`: one fixed tree of 128 independent reactive fields.
- `nested`: four component owners per item, with a statically known leaf.
- `flat`: same native DOM but one component owner per item. This is an
  **experimental lower bound**, not an equivalent automatic rewrite: it changes
  DI scopes, CSS ownership and component replay addresses. It must not be
  presented as a safe compiler gain.

The mount timer surrounds `bootstrapCraft`. Navigation-to-ready includes local
module fetching, parsing and evaluation; the two-animation-frame timer is a
rendering opportunity proxy, not proof of first paint. Updates include dispatch
and reactive work until the next microtask. These are local browser timings,
not a network/LCP benchmark. Bundle totals cover this shared fixture entry,
not the size of every possible Craft application. Heap is sampled after the
same action sequence and a CDP garbage collection.

Controls:

```sh
COMPILER_RUNS=5 COMPILER_ITERATIONS=4 COMPILER_ROWS=100,1000,5000 \
  COMPILER_CASES=rows,indexed,fields,nested,flat \
  COMPILER_OUTPUT=tmp/compiler-benchmark npm run perf:compiler
```

`COMPILER_VARIANTS=runtime,compiled` selects a cohort; `COMPILER_VARIANT=clone`
isolates a failure. The default runs all four variants.
Failures save the exact case/action to `failed-case.json` and abort. Failed
campaigns are never summarized as completed performance results.

The existing realistic admin page can also be compared:

```sh
npm run compiler:build
PAGE_VARIANTS=runtime=craft-page,compiled=craft-page \
  PAGE_COMPILER_LABELS=compiled PAGE_COUNT=false PAGE_SCALES=1,2 \
  PAGE_RUNS=7 PAGE_OUTPUT=tmp/compiler-page \
  node apps/framework-benchmark/page-lab.mjs
```

It checks the compiled and generic pages after every benchmark action and real
UI interaction, then measures them. `PAGE_COUNT=false` is required because the
instance-counting proxy intentionally changes the component definitions and
would prevent the compiled path from being exercised.
