# Text contrast, proven without a browser

`npm run style:check` reads your sheets and your templates and answers one
question, for every element it can prove holds text, in every state your axes
can produce:

> is this text readable on the background it is actually painted on?

It is WCAG 2.2 §1.4.3 level AA — `4.5:1` for normal text, `3:1` for large text
— and it needs no browser, no screenshot and no Playwright run.

::: warning What this is not
This proves **text contrast**, in a declared subset of CSS. It is not an
accessibility audit, and a green run is not a claim that your application is
accessible. Focus order, names, roles, motion, target size and everything else
are elsewhere. Read [the coverage contract](#the-coverage-contract) before you
put a badge on it.
:::

## Running it

```bash
npm run style:check
```

In a project generated with typed CSS this is already wired: it builds once so
the style plugin writes `.craft/style-graph.json`, then analyses that dump
together with your TypeScript program.

By hand, on an existing project:

```bash
npx craft-graph --style-contrast --style-dump .craft/style-graph.json --project tsconfig.app.json
```

`--json` gives a stable machine-readable report for CI. Two runs on unchanged
sources produce byte-identical output.

Unlike `--style-matrix` and `--style-debt`, this command **does** build the
TypeScript program. It has to: a contrast proof needs to know which element
carries which class and what sits above it, and no style dump has ever seen a
template.

## Reading a failure

```text
contrast/fail
route: /checkout
component: SubmitButton
element: button.root
scenario: interaction.hover=active+tone=warning
foreground: ui.text.onAccent #ffffff (dsButton-root → --dsButton-ink (initial))
background: ui.accent.warning.dark #f5b544 (button.root: dsButton-root → --dsButton-bg)
font: 14px / 600 (normal text)
ratio: 1.81:1
required: 4.5:1
```

Every line is there because a report missing it sends you to the wrong file:

- **scenario** — the exact combination. Not "the warning button": the warning
  button *under the pointer*, which is often the only failing one.
- **foreground / background** — the token name first, then the value, then the
  chain that produced it. `ui.accent.warning.dark` tells you which token to
  change; `dsButton-root → --dsButton-bg` tells you which rule put it there.
- **font** — with the threshold it earned. See
  [large text](#which-threshold-applies).

Rows that resolve to the same answer are folded together and list the
scenarios they stand for under `also in:`, so a five-tone button does not
print five identical lines.

## The two halves, and why only one of them fails a build

| | `--palette-contrast` | `--style-contrast` |
|---|---|---|
| reads | the dump alone | the dump **and** the templates |
| answers | every pair your palette can express | every pair an element is actually painted in |
| verdict | informative | **blocking** |

A palette of twenty tokens has hundreds of pairs and an application renders a
few dozen of them. Failing a build on `ui.text.onAccent` over
`ui.surface.page` — white on white, and a combination no element uses — trains
people to switch the check off, and takes the real failures with it.

So the matrix is a table you read while designing, and the analysis is the
gate. When you pass the analysis's results to `paletteContrastMatrix`, each
pair also gets a `usedBy` list of the elements that render it; without them the
field is **absent** rather than empty, because "nobody looked" and "the
analysis looked and found nowhere" are different answers.

## Which threshold applies

- large if `font-size >= 24px`;
- large if `font-size >= 18.5px` **and** the weight is at least `700`;
- normal otherwise.

Two consequences worth knowing before you argue with a report:

- `text.lg` is `1.125rem` — **18px** — so a bold title at that size is *normal*
  text and needs `4.5:1`. It misses the large threshold by half a pixel.
- `600` is not bold. WCAG says "bold" without a number and CSS says bold is
  700; reading `600` as bold would lower a threshold on an ambiguity, which is
  the wrong side to err on.

`rem` becomes pixels against a 16px root. If your page sets a different root
size outside CraftTS, say so — nothing in the dump can know.

The ratio is **never rounded before it is compared**. `4.4999:1` fails a 4.5
threshold, even though the report prints it as `4.49:1`.

## How colour is resolved

### `color` is inherited

The analysis walks the element's ancestor chain outside-in, exactly as the
cascade does. A paragraph that sets no colour of its own takes the one from
its card, or from the theme wrapper above it.

### The background is the first opaque thing underneath

Starting at the element and walking outwards:

- an element that paints nothing is transparent, and the search continues;
- the first opaque colour wins;
- an element that paints something the model cannot read — an image, a
  semi-transparent fill, anything behind an `opacity` — **stops** the search
  and produces `indeterminate`, because whatever is behind it is no longer
  what the text is composited against.

If nothing in the chain paints, that is `unknown-background`. It is not
"assume white": a white assumption is right on one theme and wrong on the
other.

### Variables resolve the way `@property` says they do

- a registered variable nobody wrote resolves to its **registered initial
  value**, not to the `var()` fallback;
- `inherits: false` really does not cross into a child — a theme variable set
  on a wrapper reaches the button, a component variable does not.

That last one is the trap the design system is full of, and getting it wrong
would prove the wrong colour for every component under a themed wrapper.

### The cascade is replayed, not approximated

Three tie-breaks, in the browser's order:

1. **Layer.** Unconditional atoms land in `components`, conditional ones in
   `variants`, so every variant beats every base rule.
2. **Specificity**, inside `variants`. `&[data-tone='warning']:hover` has one
   more selector fragment than `&[data-tone='warning']`, so the hovered fill
   wins — whatever the source order. A media query contributes nothing.
3. **Source order**, last, which is atomic class-name order because that is
   how the emitter sorts the layer.

Getting the second wrong is the interesting failure: a solver would resolve a
tone-plus-hover button to its resting fill and report `pass` on the state that
fails.

## Hover is an axis

```ts
when(tone.warning, [
  set(buttonVars.bg, ui.accent.warning),
  when(interaction.hover, [set(buttonVars.bg, ui.accent.warningHover)]),
]);
```

`interaction.hover` emits the same `:hover` rule a hand-written selector would.
What it adds is that the point lands in the class's variant contract — so the
visual matrix captures the hovered state, and this analysis crosses the
colours it writes with the text that sits on them.

A `:hover` typed into a string is invisible to both. That is how a button ends
up readable at rest and unreadable under the pointer: the one state nobody
screenshots. The `prefer-hover-axis` lint rule refuses it.

The axis carries its own driver (`{ kind: 'selfState', state: 'hover' }`), so a
capture of the hovered state is something a harness can actually produce.
`applyScenario` asks the page to move a real pointer and throws if it cannot —
dispatching a `mouseover` event would fire listeners and leave the pseudo-class
untouched, producing a screenshot of the base state that passes forever.

The cost is real and it is a decision: hover doubled the demo button's matrix
from 18 scenarios to 36. That is why the axis has to be in the sheet's budget.

## Naming your palette

```ts
export const ui = definePalette('ui', {
  text: { onAccent: { light: '#ffffff', dark: '#0b0d11' } },
  accent: { warning: { light: '#8a5a00', dark: '#f5b544' } },
});
```

The name travels with every colour, through variables and `darkOf()`, all the
way into the report. `definePalette(spec)` without a name still works and still
carries the group and the token — you get `(unnamed).accent.warning`, which
points at the right entry and asks to be named.

Write hovered and pressed fills as **tokens**, not as a `darken()` at the use
site. A function hides the resulting colour from the palette, and the palette
is where the contrast question gets settled once instead of per component.

## The coverage contract

### Covered in v1

- opaque colours in hexadecimal or `rgb()`/`rgba()`;
- inherited `color`;
- `background-color`, local or seen through transparent ancestors;
- CraftTS variables declared with `cssVars()`, their initial values, their
  conditional writes and their `var()` fallbacks;
- constant classes from `craftStyles()`;
- light and dark themes;
- every finite state and size axis, `interaction.hover` included;
- static and dynamic text, wherever the element can be proven to hold text;
- a component evaluated once per surface it is rendered on.

### Not covered in v1

Each of these produces `indeterminate` with its reason — never a pass.

- images and gradients behind text;
- `canvas`, text inside SVG, generated pseudo-element content;
- `filter`, `backdrop-filter`, `mix-blend-mode`, and any `opacity` below 1;
- semi-transparent colours, which would need compositing;
- CSS expressions the DSL does not model;
- colours computed from runtime data that is not a finite set;
- external stylesheets and inline styles outside CraftTS;
- CJK metrics and unusual font geometry — the size in CSS pixels is not the
  size on screen, and the large-text convention assumes latin faces.

### What `indeterminate` means, and why it fails by default

| reason | what happened |
|---|---|
| `unknown-foreground` | nothing readable sets the text colour |
| `unknown-background` | nothing in the chain paints an opaque surface |
| `unknown-font-size` | the size is not a length this can turn into pixels |
| `unsupported-background` | an image, a gradient, a blend, or an alpha |
| `dynamic-style` | the class is assembled at runtime |
| `external-style` | the styles come from outside CraftTS |
| `incomplete-render-context` | the component is rendered somewhere unanalysed |

**Indeterminate results fail the run.** `--allow-indeterminate` downgrades them
to warnings, and you have to type it. A check whose default treats "I could not
tell" as "fine" reports a clean bill on the half of the application it
understood — and that half is exactly where the gradients and the runtime
colours live.

A report with **no violations and open indeterminates is not a proof.** The
summary prints all three counts for that reason:

```text
Text contrast: 41 pass, 0 fail, 3 indeterminate (44 checked).
```

Zero checked is not a pass either, and the tool says so: it nearly always means
the dump and the program describe different applications.

## Fixing a violation

1. **Read the scenario.** If only the hovered or only the dark row fails, the
   fix belongs to that one rule, not to the token everything uses.
2. **Read the token names.** A pair that fails in several places is a palette
   decision — change the token once, and `usedBy` tells you what moves.
3. **Change the token, not the call site.** A local override is a colour the
   palette no longer describes, and the next component repeats the bug.
4. **If the text is genuinely large**, check that the sheet says so. 18px bold
   is normal text; 22px bold is large.
5. **Re-run.** The report is deterministic, so a diff of two JSON runs shows
   exactly what your change moved.

## Clearing an indeterminate

You have three honest moves, and inventing a colour is not one of them.

- **Bring the surface into the model.** A `background-color` set in raw CSS is
  the common case; `no-unmodelled-text-color` points at it.
- **Give the text a surface it can be measured against.** Text over a hero
  image has no ratio because it has no single background — put it on a panel,
  or accept that it cannot be proven.
- **Declare the surface uncovered.** Add its path to the
  `no-unmodelled-text-color` rule's `uncovered` option. The gap is then
  counted as a gap rather than mistaken for a proof, which is the whole point.

## Migrating an existing project

1. Name your palette: `definePalette('ui', spec)`. Nothing else changes.
2. Turn hand-written `:hover` rules into `when(interaction.hover, …)` and add
   `interaction` to those sheets' budgets. `prefer-hover-axis` finds them.
3. Add `dumpPath: '.craft/style-graph.json'` to `craftStyle()` in
   `vite.config.ts`.
4. Replace `style:check` with a build followed by
   `craft-graph --style-contrast`.
5. Run it with `--allow-indeterminate` **once**, to see the size of the gap.
6. Close the gaps, or declare them uncovered, and drop the flag. Leaving it on
   permanently is the same as not having the check.
