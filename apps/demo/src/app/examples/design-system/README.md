# A mini design system

A small, real design system built on `@craft-ts/style`, at
[`/design-system`](http://localhost:4200/design-system) in the demo. It exists
to answer the question the library's own specs cannot: _what does using this
actually look like?_

## The files

| file                    | what it is                                                                    |
| ----------------------- | ----------------------------------------------------------------------------- |
| `foundation.style.ts`   | palette, axes, and the **theme** — everything a component sheet may depend on |
| `components.style.ts`   | the sheets: stack, button, card, alert, meter                                 |
| `ds-components.ts`      | the components: `DsButton`, `DsGhostButton`, `DsAlert`, `DsMeter`             |
| `design-system-demo.ts` | the page that assembles them                                                  |

Note what is **not** here: no `styles` block, no `.css` file, no class string
built at render time. The whole stylesheet is emitted at build time from the two
`*.style.ts` files and deduplicated with every other sheet in the app.

## The four habits it is trying to teach

**A variant is an axis, not a class name.** The five tone buttons share one
class; what differs is `data-tone`. Click one and watch the DOM: the class list
is byte-identical before and after. That is what makes the set of visual states
enumerable instead of guessable — and it is what wave 2 turns into a scenario
matrix.

**A component reads theme variables, never palette tokens.** `card.root` reads
`--ds-raised`; it has no idea what colour that is. The theme decides, in one
place, and dark mode is therefore **one rule** in `foundation.style.ts` rather
than one per component.

**What moves at runtime goes through a variable.** The meter's fill width comes
from a signal, so it cannot be a class — there is no finite set of widths to
emit. It goes through `--ds-meter-value`, a registered `<percentage>`, written
with `assign(...)`. This is the whole static/dynamic split in one component.

**Not everything needs to be a component.** `stack` and `card` stay sheets the
caller applies. A design system that wraps every rectangle ends up with fifty
components that only set padding.

## Two traps this demo walked into, and what they cost

Both were found by building this page, and both are the kind that leave every
test green.

**`@property` needs a computationally independent `initial-value`.**
`initial-value: 1rem` makes the whole registration invalid, and the browser
drops it _silently_. The variable then resolves to nothing wherever it is read,
and the declaration computes to zero — which showed up as buttons with no
padding while the colours worked fine. `cssVars` now refuses a relative unit
there and says what to use instead.

**`inherits: false` is the right default, and wrong for a theme.** A variable an
element sets on itself and reads on itself should not inherit: it bounds
invalidation. A theme variable is the opposite — set once on a wrapper, read by
everything below — so a non-inheriting theme hands every descendant the initial
value. Symptom: dark mode appears to do nothing, with no error anywhere. The
theme in `foundation.style.ts` passes `{ inherits: true }`; `dsButton-bg` next
door deliberately does not.

## Where this stops

Level 1 of the plan, and no further. There is no scenario matrix yet (wave 2),
and no context obligation — no `requires(scrollPort.block)` — on any of these
components (wave 3). The axes already carry their drivers, which is what those
waves will build on.
