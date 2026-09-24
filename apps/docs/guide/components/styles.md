# Styling a component: the only way

A component is styled through [`@craft-ts/style`](../style/), and through
nothing else. Its visual rules live in a `*.style.ts` sheet beside it; the
template binds the sheet's classes, sets `data-*` attributes for its variants,
and writes typed variables for what changes at runtime. There is no CSS string
on the meta, no `.css` import, no class assembled at render time and no raw
`style`.

That is not a preference. A class built in the browser, or a rule shipped as a
string, is a visual state nothing recorded: the [visual matrix](/guide/style/testing)
enumerates what the sheets declare, the [static contrast check](/guide/style/contrast)
measures what the sheets write, and anything outside them is invisible to both.
ESLint and the architecture suite therefore refuse every other route, and the
one real exception is written down, with its reason, for someone to decide on.

## The shape

The sheet declares the classes, the axis a variant moves along, and the
variables a template may write:

<<< @/tests/snippets/guide/components/styles/card.style.ts#sheet

The component imports it and binds **one constant class per element**:

<<< @/tests/snippets/guide/components/styles/card.spec.ts#component

- `class` is always a sheet key (`card.root`), an array of them, or a typed
  input carrying one. Never a string, a template literal or a conditional.
- The variant is an **attribute**. `data-cardTone` is on the element, the sheet
  reads it through `when(cardTone.danger, …)`, and a `null` removes it.
- `style` accepts `assign(variable, value)` and nothing else — one call, several
  spread into an object, or a function returning them.

## Where each thing goes

| You want                                   | Write                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| the component's own look                   | `craftStyles('name', { root: [...] })` in `name.style.ts`                               |
| a variant (tone, size, selected)           | `defineStateAxis(...)`, then `when(axis.point, [...])`; the template sets `data-*`      |
| a state the platform already announces     | `ariaCurrent`, `ariaPressed`, `ariaInvalid`, `interaction.hover` / `.focus` / `.disabled` |
| a value known only at runtime              | `cssVars(...)` in the sheet, `assign(...)` in the template                             |
| a child that follows its parent's state    | a variable declared with `{ inherits: true }`, set by the parent, read by the child     |
| page defaults (`body`, links, the theme)   | [`craftGlobalStyles`](/guide/style/foundation)                                          |
| a web font                                 | [`defineFont`](/guide/style/foundation)                                                  |
| `::before`, `@keyframes`, transitions      | [`pseudo.*`, `keyframes`, `animate`](/guide/style/pseudo-elements)                      |

The reset and the good defaults — focus ring, reduced motion, colour scheme —
come from `@craft-ts/style` itself. An app has no `styles.css` to write.

## What refuses the other routes

Per file, in `craftRules.configs.recommended`
([details](/guide/routing/eslint-rules)):

- `no-raw-class` — a `class` that does not trace back to a sheet imported from a
  `*.style` module;
- `no-inline-style` — a `style` that is not `assign(...)`;
- `no-component-css` — `meta.styles`, `meta.stylesUrl`, `meta.contentStyles`, and
  any `.css` import other than `virtual:craft-style.css`;
- `style-file-boundary` — a sheet importing anything but style vocabulary;
- `no-raw-css-value`, `no-free-has` — a raw value or a hand-written `:has()`
  inside a sheet.

Across the application, in the base architecture rules
([details](/guide/testing/architecture)):

- `style-only-design-system` — an element whose class reaches no sheet the build
  emits;
- `no-global-stylesheet` — an entry file importing a `.css`, or `index.html`
  linking a stylesheet;
- `style-obligations-discharged`, `no-dangling-css-vars` — a `requires` nobody
  provides, a variable read and never declared.

`styles`, `stylesUrl`, `contentStyles` and `cssVars` still exist on the meta's
type, marked `@deprecated`. They are kept so that the exception below stays
possible, not as an alternative.

## The one real exception

Content you do not author — HTML rendered from markdown, a third-party widget
that ships its own stylesheet — cannot be styled through a sheet. It is the only
case, and it takes an explicit, reasoned bypass:

```ts
// eslint-disable-next-line craft-ts/no-component-css -- vendor date picker ships its stylesheet
import 'vendor-date-picker/dist/picker.css';
```

`no-forbidden-eslint-disable` refuses the directive without its reason. On the
architecture side, the bypass is a waiver in `architecture/waivers.ts`:

```ts
{
  rule: 'no-global-stylesheet',
  target: 'file:src/main.ts',
  reason: 'The vendor date picker ships its stylesheet.',
}
```

A waiver names one target, not a rule wholesale, and one that no longer waives
anything fails the check. Both kinds of bypass appear in the **Bypasses** view of
[Review Attest](/guide/style/attestation), one subject per directive or waiver,
to be accepted or rejected like any other evidence.

## See Also

- [`@craft-ts/style`](/guide/style/) — the design system, from tokens to the matrix
- [Axes and the visual matrix](/guide/style/variants)
- [Customization](/guide/components/customization) — host properties and caller overrides
