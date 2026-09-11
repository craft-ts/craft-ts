# Axes and the visual matrix

Level 2. Adopted per component, and it is what turns "I think that is all the
states" into a list.

## A variant is an axis, not a class name

```ts
import {
  bg,
  craftStyles,
  defineStateAxis,
  palette,
  set,
  when,
} from '@craft-ts/style';
// `v` is your own sheet's typed variables, `bp` your own breakpoints — see
// [Defining a design system](./define.md).
import { bp, v } from './foundation.style';

export const tone = defineStateAxis('tone', ['neutral', 'danger']);

export const badge = craftStyles('badge', {
  root: [bg(v.bg), when(tone.danger, [set(v.bg, palette.accent.danger)])],
});
```

The template sets **one static class** and a `data-tone` attribute. Nothing
concatenates a class at render time, which is what makes the set of states
enumerable. The `no-raw-class` rule enforces it in files that use the package.

Conjunction is nesting, and only nesting:

```ts
import { fontWeight, scheme, when } from '@craft-ts/style';

when(scheme.dark, [when(bp.md, [fontWeight.bold])]);
```

One way to write each thing, so two identical components cannot produce two
different contracts.

## Only the points you actually cross

`bp` may define `sm`, `md` and `lg`; a component that cuts at `md` contributes
**two** cells, not four. The contract records what the sheet uses, never what the
axis offers.

An interval nothing can satisfy — `above(bp.lg)` containing `below(bp.sm)` —
throws when the sheet is registered, which under the build plugin is a build
failure.

## Hover, and every pseudo-class after it

```ts
when(interaction.hover, [set(buttonVars.bg, ui.accent.warningHover)]);
```

`interaction.hover` emits the same `&:hover` rule you would write by hand.
What it adds is that the point enters the class's contract — so the matrix
enumerates the hovered state, and the
[static contrast check](./contrast.md) crosses the colours it writes with the
text on top of them. A `:hover` typed into a string emits identical CSS and is
invisible to both, which is how a button ends up readable at rest and
unreadable under the pointer. `prefer-hover-axis` refuses it.

It is a real axis with a real price: it doubles the sheet's matrix, so it has
to be in the budget below. Its driver is `{ kind: 'selfState', state: 'hover' }`,
and `applyScenario` honours it by asking the page to move a pointer — a
dispatched `mouseover` sets no pseudo-class and would capture the base state
while looking correct.

## The budget

```ts
import { craftStyles } from '@craft-ts/style';

craftStyles('button', { root: [...] }, { axes: [tone, size, interaction] })
```

An axis outside the budget is a compile error naming it. Without this, an axis
added deep in a leaf shows up as a doubled capture bill three levels up and
nobody decided that. A declared axis that goes unused is reported, not rejected.

## The matrix

```ts
import { visualMatrix, branch } from '@craft-ts/style-testing';

visualMatrix(card);
// [{ id: 'base', … }, { id: 'viewport=md', … }]
```

It takes **sheets**, not a component: a component's classes are only knowable by
rendering it, and a matrix that silently missed a child's sheet would be the
worst possible outcome.

Identifiers name only the axes away from `base`, so adding an axis elsewhere in
the app does not invalidate every baseline in the suite.

Two reductions are applied, and both are exactly true rather than probably true:

- **A branch adds, it does not multiply.** The two sides of an `ifNode` are
  never on screen together, so declare it — `branch('footer', footerSheet)` —
  and the absent side stops carrying the footer's axes.
- **A container axis stops at its owner.** An ancestor cannot change how wide
  that box is, so only the component naming the container keeps the axis.

Nothing else is reduced. A coverage that claims to be complete without being
complete is worse than no coverage.
