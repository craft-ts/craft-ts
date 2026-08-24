# Progressive rendering with `scheduleFor`

`forNode` renders synchronously by default. That is the right choice for short
lists and keeps the initial behavior predictable. For a large collection,
`scheduleFor` lets Craft spread fragment creation and updates over animation
frames.

## Basic usage

```ts
import { forNode, scheduleFor } from '@craft-ts/component';

forNode(cells, { track: (cell) => cell.id }, (cell) => renderCell(cell)).pipe(
  scheduleFor({
    enabled: true,
    strategy: 'frame',
    frameBudgetMs: 4,
  }),
);
```

The directive is attached to the `forNode` node. It does not add a DOM wrapper and
does not change the `item`, `index`, dependency, exception, or pending-source
contracts of the block.

## When to use it

Use `strategy: 'frame'` when the first visible items should appear quickly and
the browser must keep handling input and painting while the rest of the list is
created. A smaller `frameBudgetMs` yields more often; a larger budget completes
the list sooner but can occupy the main thread for longer.

Disable it explicitly when a screen needs the synchronous behavior:

```ts
forNode(items, { track: (item) => item.id }, renderItem).pipe(
  scheduleFor({ enabled: false, strategy: 'frame' }),
);
```

`forNode` without `scheduleFor` is already synchronous. The first delivery
supports `sync` and `frame`; `idle` will be added with its fallback policy in a
later delivery.

## What scheduling does—and does not do

Scheduling improves perceived responsiveness by yielding between batches. It
does not reduce the total work required to create or update every fragment.
Stable keys still control reconciliation, and existing keyed DOM fragments keep
their identity when the collection is reordered.

For very large or continuously scrolling collections, prefer virtualisation:
it reduces the number of DOM nodes and bindings that exist at the same time.
Scheduling and virtualisation solve different problems and can eventually be
combined.

## Pixel Art Workshop

The demo's Pixel Art Workshop uses frame scheduling for its 256-cell grid:

```ts
forNode(INDEXES, { track: (index) => index }, renderCell).pipe(
  scheduleFor({ strategy: 'frame', frameBudgetMs: 4 }),
);
```

The production benchmark can compare the synchronous baseline and frame mode
with 256, 1,000, and 10,000 cells. Its commands and metrics are documented in
`docs/benchmarks/schedule-for-pixel-art.md` in the repository.
