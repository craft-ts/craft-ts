---
name: craft-ts-style
description: Build and review the typed design system of a CraftTS project with @craft-ts/style — palettes, axes, typed custom properties, sheets, context obligations, the visual matrix, and the style_impact / style_matrix / style_debt MCP tools. Use when adding or changing visual rules, a variant, a theme, dark mode, or a visual test.
---

# CraftTS typed styles

`@craft-ts/style` makes a component's visual surface **derivable** rather than
guessed: what the exhaustive set of visual states is, which are impossible, and
whether the context a rule needs exists — all from the same values the CSS is
emitted from.

## First: is it wired at all?

The system is a **build step**, not a runtime library. Before writing a rule,
confirm three things exist; without them the sheets typecheck and emit nothing.

1. `@craft-ts/style` in `dependencies`, `@craft-ts/style-testing` in
   `devDependencies`.
2. `craftStyle()` from `@craft-ts/style/vite` in the Vite `plugins` array, with
   a `dumpPath`. The dump is what the graph and the MCP tools below read; no
   `dumpPath`, no answers.
3. `import 'virtual:craft-style.css'` once, at the app entry.

A project created by `craft create` already has all three.

## Hard rules

- **Static variation goes to a class the emitter wrote; dynamic variation goes
  through a typed custom property.** No class is ever assembled in the browser.
- **A variant is an axis, never a class name.** The template sets one constant
  class and a `data-*` attribute. `class:` bound to a string, a template
  literal or a function is a visual state nothing recorded — `no-raw-class`
  reports it in every file that imports `@craft-ts/style`.
- **A `*.style.ts` imports vocabulary and nothing else.** That is what makes it
  safe for the plugin to import it in Node. `style-file-boundary` enforces it.
- **Components read theme variables, never palette tokens.** The theme is the
  one place that decides what a variable holds in light and in dark, which is
  what makes dark mode one rule instead of one per component.
- **No value is a string.** `space(4)`, `unit.rem(1.5)`, `palette.text.strong` —
  never `'12px'`. The scales are closed; when a step is missing, add it to the
  scale. `no-raw-css-value` reports the rest.
- **`overflow` is not in the property table.** The only road to
  `overflow-block: auto` is `provides(scrollPort.block)`.
- **`:has()` is not free-form.** `no-free-has` reports a hand-written one; use
  the `descendant` axis.
- Escape hatches — `unsafeLength(value, reason)`, `unsafeAssume(id, reason)` —
  compile and propagate `unproven` to the graph, where the debt is counted.
  Take one only with a reason a reader can act on.

## Where things are declared

| you need              | call                                        |
| --------------------- | ------------------------------------------- |
| colours               | `definePalette({ group: { token: { light, dark } } })` |
| viewport breakpoints  | `defineBreakpoints({ md: at.minInlineSize(unit.rem(48)) })` |
| a state variant       | `defineStateAxis('tone', ['neutral', 'danger'])` |
| an axis that may only write one kind | `defineAxis(name, values, onlyVarsOfKind(kind.color))` |
| the size of a box     | `defineContainer({ name, type }, points)`    |
| typed custom properties | `cssVars('prefix', { ink: kind.color(token) })` |
| the rules themselves  | `craftStyles('name', { root: [...] }, { axes: [...] })` |

`scheme`, `motion`, `forcedColors`, `contrast`, `scrollState` and `descendant`
ship with the package and need no declaration.

Two details the types cannot enforce and the browser does:

- a registered `initial-value` must be computationally independent —
  `kind.length(unit.px(16))`, never `unit.rem(1)`, or the browser drops the
  `@property` rule silently;
- `inherits: true` belongs to theme variables and to nothing else.

## Context obligations

`requires(scrollPort.block)` on a class travels up the tree until a
`provides(...)` answers it, and becomes an error only where a component seals
(`{ seals: [true] }`) or `seal(node)` closes it. Put the provider on the layout
component that owns the area — an `overflow` on the direct parent creates a
second scroll port and moves the bug instead of fixing it.

Level 3 is a **per-route** guarantee. One component in the path handing back a
loosely typed subtree stops the requirement travelling, and a partial adoption
gives zero of the guarantee, not most of it.

## Testing

```ts
import { applyScenario, visualMatrix } from '@craft-ts/style-testing';

for (const scenario of visualMatrix(sheet)) {
  await applyScenario(page, scenario);
  await expect(page).toHaveScreenshot(`${scenario.id}.png`);
}
```

`visualMatrix` takes **sheets**, not a component. `assertExhaustiveVisualMatrix`
fails in both directions: a baseline nothing produces any more is as wrong as a
missing one.

## Asking the graph

Three MCP tools read the dump, so you do not have to write a script:

- `style_impact` — which classes a change to given custom properties reaches.
  Run it before rerunning a visual suite; changing one token should not
  recapture everything.
- `style_matrix` — what the app costs to capture, with the median and the
  largest. Those two numbers decide whether matrix reduction is worth opening.
- `style_debt` — escape hatches with their reasons, obligations discharged
  nowhere, variables never read, components no sheet is known to style. Read
  `extractionGaps` first; the rest is only meaningful on a complete graph.

An empty `style_matrix` is the signature of a missing `dumpPath`.

Full guide: `/guide/style/setup`, `/guide/style/define`, `/guide/style/tokens`,
`/guide/style/variants`, `/guide/style/obligations`, `/guide/style/testing`.
