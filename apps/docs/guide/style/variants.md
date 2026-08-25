# Axes and the visual matrix

Level 2. Adopted per component, and it is what turns "I think that is all the
states" into a list.

## A variant is an axis, not a class name

```ts
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

## The budget

```ts
craftStyles('button', { root: [...] }, { axes: [tone, size] })
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

- **A branch adds, it does not multiply.** The two sides of an `ifBlock` are
  never on screen together, so declare it — `branch('footer', footerSheet)` —
  and the absent side stops carrying the footer's axes.
- **A container axis stops at its owner.** An ancestor cannot change how wide
  that box is, so only the component naming the container keeps the axis.

Nothing else is reduced. A coverage that claims to be complete without being
complete is worse than no coverage.
