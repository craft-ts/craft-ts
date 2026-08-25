# Defining your design system

The other pages in this section spend `bp`, `scheme`, `palette`, `v`, `space`
and `unit` as if they were already in scope. They are not built in — except
`scheme`, which is. This page is where the rest come from.

Everything here goes in one sheet, conventionally `foundation.style.ts`. A
`*.style.ts` may import vocabulary and nothing else — the `style-file-boundary`
rule enforces it — which is exactly what makes it safe for the build plugin to
import the file in Node: there is no application code in it to run.

<<< @/tests/snippets/guide/style/define/foundation.spec.ts#imports

## The palette

`definePalette` takes a group-of-tokens shape where every token carries **both**
of its values at once:

<<< @/tests/snippets/guide/style/define/foundation.spec.ts#palette

`@craft-ts/style` already exports a `palette` built the same way — the same four
groups, with neutral defaults. Spend it as-is to get moving, and call
`definePalette` when you want your own colours; the pages that follow use the
name `palette` for whichever one is in scope.

A token is not a colour string; it is a pair plus a role, and the role comes from
the group it sits in (`surface`, `text`, `border`, `accent`). `darkOf(token)` is
how a sheet reaches the other side of the pair, and the role travels with it —
the dark side of a surface is still a surface.

Components never read the palette directly. They read a **theme variable**, and
the theme is the single place that decides what a variable holds in light and in
dark. That indirection is what makes dark mode one rule instead of one rule per
component.

## Axes

A component may only vary along an axis you declared. There are four ways to
declare one, and the choice is about what drives the variation.

### `defineBreakpoints` — the viewport

<<< @/tests/snippets/guide/style/define/foundation.spec.ts#breakpoints

Breakpoints are an **ordered** axis: two points can be compared, which is what
lets the matrix reduce by interval instead of by product, and what makes a rule
that can never apply detectable. `above(...)` and `below(...)` turn a point into
an explicit bound.

### `defineStateAxis` — an attribute you set

<<< @/tests/snippets/guide/style/define/foundation.spec.ts#state-axis

Each point carries the driver that reaches it — here `data-tone='danger'` — so a
scenario the matrix enumerates is a scenario a test can actually produce. The
attribute-_value_ form, rather than one attribute per state, is what makes the
states mutually exclusive by construction: an element cannot be two of them at
once, so the matrix does not have to be told.

### `defineAxis` — a state axis with a write constraint

<<< @/tests/snippets/guide/style/define/foundation.spec.ts#constrained-axis

`onlyVarsOfKind(kind.color)` says this axis may write `<color>` custom
properties and nothing else. An axis that can only write colours cannot move a
box, so it crosses **additively** with the axes that do rather than multiplying
them. The constraint is checked where it is cheap — at the `when` call site —
instead of by reading the emitted CSS afterwards.

`defineStateAxis` is `defineAxis` without the options object; it stays a
separate name because the unconstrained case is the common one and reads better
without them.

### `defineContainer` — the size of a box, not of the window

<<< @/tests/snippets/guide/style/define/foundation.spec.ts#container

A container axis answers "how wide is _my_ box", which nobody above the container
can change. So it is closed at the element that declares the container: the
matrix prunes it there rather than letting every ancestor inherit scenarios it
has no way to affect.

### The standard axes

`scheme`, `motion`, `forcedColors`, `contrast`, `scrollState` and `descendant`
ship with `@craft-ts/style` and need no declaration — they are driven by the
user agent or by the element's own state, not by an attribute you own. `scheme`
is the one the theme below uses.

### `axisPoint` — the escape hatch

`axisPoint(axis, point, open, driver, extra)` builds a point by hand, for a
selector none of the four constructors produce. You give up nothing type-side,
but you take on the part the constructors were doing for you: the `driver` must
really reach the `open` selector, and nothing checks that for you.

## The theme

`cssVars(prefix, specs)` declares the typed custom properties. Each is registered
through `@property`, so the browser validates it: assigning a length where a
colour belongs paints nothing rather than painting wrong.

<<< @/tests/snippets/guide/style/define/foundation.spec.ts#theme

Two things on that block are worth stopping on.

**`inherits: true` belongs to theme variables and to nothing else.** The default
is `false`, and that is the right default for a variable an element sets on
itself and reads on itself — it bounds invalidation to that element. A theme
variable is the opposite case: set once on a wrapper, read by everything below.
A non-inheriting theme hands every descendant the initial value instead, which
looks exactly like dark mode not working, with no error anywhere.

**`kind.length(unit.px(16))`, not `unit.rem(1)`.** `@property` requires a
computationally independent initial value; a relative one makes the browser drop
the registration entirely, and silently. The theme writes the `rem` value in the
rule below.

::: tip `cssVars` here is not `meta.cssVars`
`cssVars(prefix, specs)` from `@craft-ts/style` declares registered custom
properties for a design system. `meta.cssVars` on `craftComponent` declares one
component's per-instance styling API. Same word, two mechanisms — see
[Typed CSS variables](../components/css-variables.md) for the other one.
:::

## `seal` — closing a tree

`seal(node)` is the only place a [context obligation](./obligations.md) becomes
an error. Up to that point an unanswered requirement keeps travelling, because an
ancestor still has the right to answer it. `seal` is you saying: from here up,
nobody else will.

Put it at the root of a route, not around the component that raised the
requirement — that is the whole point of letting obligations travel.

## Next

- [Tokens and typed variables](./tokens.md) — spending what you just declared.
- [Axes and the visual matrix](./variants.md) — `when`, and the matrix the axes
  above generate.
- [Context obligations](./obligations.md) — `requires`, `provides`, and `seal`.
