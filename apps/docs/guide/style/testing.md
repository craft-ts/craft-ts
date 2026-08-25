# Testing what you built

The matrix says what the states are. This page is how you look at them.

## Drivers

Every axis point carries the driver that reaches it. An axis without one would
be worse than a missing axis: the matrix would enumerate scenarios nothing can
produce and render identical captures — false coverage rather than none.

```ts
import { applyScenario, visualMatrix } from '@craft-ts/style-testing';

for (const scenario of visualMatrix(card)) {
  await applyScenario(page, scenario);
  await expect(page).toHaveScreenshot(`${scenario.id}.png`);
}
```

`page` is described structurally, so Playwright is not a dependency — a
Playwright `Page` matches the shape and is passed unchanged.

Application order is fixed in one place (`orderedDrivers`): emulation and
viewport first because they relayout, container width next, DOM state after,
scrolling last. Applying them in declaration order instead would make a capture
depend on which axis someone wrote first.

## Exhaustiveness

```ts
assertExhaustiveVisualMatrix(visualMatrix(card), baselinesIn(files));
```

It fails in **both** directions. A baseline nothing produces any more matters as
much as a missing one: it is a state the component used to have, and whoever
opens the folder still counts it as covered.

The check is post-inference on purpose. A self-referential constraint on the
component's own declaration resolves the union to `never` and passes while
checking nothing — the same shape as `assertExhaustiveRouteExceptions`.

## Content cases

The matrix covers _conditions_, not _data_ — and the eighty-character title, the
empty list and the seven-figure price are what break layouts most often. No type
can derive them, so they are declared:

```ts
contentCases(visualMatrix(card), { longTitle: 'x'.repeat(80), empty: '' });
```

A data case is rendered at one point of each axis, except on the axes that change
the space available — viewport and container — where the crossing is complete. A
long title behaves differently at two widths; it does not behave differently in
two colour schemes.

## What the graph adds

The style dump joins the dependency graph, so the questions that cross layers
have answers:

```ts
matrixSizeByComponent(graph); // what a component costs to capture
impactedClasses(graph, ['--ds-accent']); // what one token change can be seen in
varsWrittenBy(graph); // proves a colour axis only repaints
danglingVars(graph); // declared and never read
unproven(graph); // every escape hatch, with its reason
```

`impactedClasses` is the one that pays for the visual CI: changing a colour
should recapture what reaches it, not the whole suite.
