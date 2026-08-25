# Context obligations

Level 3. **Adopted per whole route**, and that granularity is the whole point of
this page.

## What it is for

A sticky element needs a scroll port. A scroll-state query needs an element
declaring the container. Get either wrong and nothing errors — the component
simply never appears, or sticks to the wrong box, and you find out in a
screenshot weeks later.

```ts
import {
  craftStyles,
  display,
  insetBlockEnd,
  position,
  provides,
  requires,
  scrollPort,
  space,
} from '@craft-ts/style';

export const backToTop = craftStyles('backToTop', {
  anchor: [
    requires(scrollPort.block),
    position.sticky,
    insetBlockEnd(space(4)),
  ],
});

export const shell = craftStyles('appShell', {
  main: [provides(scrollPort.block), display.block],
});
```

`requires` is attached to the **class**, not the sheet, so the error names a
rule rather than a file. And `provides(...)` returns the CSS effect **and** the
discharge in the same object: since `overflow` is not in the property table,
this is the only road to `overflow-block: auto`. Claiming to provide without
laying the CSS is not something anyone can write.

## Where it becomes an error

Nowhere, until a component seals:

```ts
import { craftComponent } from '@craft-ts/component';

craftComponent('AppShell', { seals: [true] }, factory, template);
```

Until then the requirement **travels** — an ancestor still has the right to
answer it, and complaining early would be wrong. Sealing says "from here up,
nobody will".

Remove the provider and the typecheck fails:

> `ERROR_unmet_context_requirement: "'scrollPort.block' is required by this
subtree and nothing above it provides one. declare it on the layout component
that owns the scrollable area. An overflow on the direct parent would create a
second scroll port, and the sticky element would stick to the wrong container."`

What is missing, where to put it, and what the obvious wrong fix would do.

## Why the granularity is the route

The requirement is carried by the type of the render tree. It crosses a
component boundary only where the tree is typed all the way through. One
component in the path that hands back a loosely typed subtree, and the demand
stops travelling — silently, because nothing is wrong with _that_ component.

So level 3 is not something you get for the components you migrated. You get it
for a route once the route is migrated, and not before. The dependency graph
reports which components are not covered rather than reporting a clean bill:

```ts
import { extractionGaps, undischargedObligations } from '@craft-ts/dev-tools';

extractionGaps(graph); // components no sheet is known to style
undischargedObligations(graph); // required somewhere, discharged nowhere
```

## The marked way out

```ts
import { scrollPort, unsafeAssume } from '@craft-ts/style';

unsafeAssume(scrollPort.block, 'the host page owns the scroll port');
```

Discharges without laying the CSS, for the cases the model cannot see — a shell
owned by someone else. It propagates `unproven`, so the graph counts it as debt.
An escape hatch that did not bubble up would be a design bug, not a convenience.
