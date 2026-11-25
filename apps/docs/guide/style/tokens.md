# Tokens and typed variables

Level 1. Useful from the first component, and it does not require anything else
in the app to change.

## No value is a string

Every value is a **nominal object**, not a branded string:

```ts
import { bg, p, palette, space, unit } from '@craft-ts/style';

p(space(4)); // ✅
p(unit.rem(1.5)); // ✅
p('12px'); // ❌ a length is not a string
p(`${4}px`); // ❌ not even one of the right shape
bg('red'); // ❌ a colour is not a keyword
p(palette.text.strong); // ❌ a colour is not a length
```

The shape matters more than it looks. With `string & { __length?: true }` —
an _optional_ phantom on a primitive base — `'blabla'` stays assignable, every
test stays green, and the guarantee written on this page is false.

## The scales are closed

`space(7)` does not compile. When a step is missing, add it to the scale; there
is no `[17px]` arbitrary-value syntax on purpose.

The one way out is marked:

```ts
import { unsafeLength } from '@craft-ts/style';

unsafeLength('13px', 'aligns with a legacy image');
```

It compiles, and it propagates `unproven` to the dependency graph, where the
debt is counted. Without this door a blocked agent bypasses the design system
entirely; with it unmarked, it bypasses it in silence.

## The property table is generated

477 properties, generated from MDN data — which is what guarantees no keyword
was invented. A closed keyword set is a namespace, never a string:

```ts
import { display, position } from '@craft-ts/style';

display.inlineFlex; // ✅
display.inlineFlexx; // ❌ Property 'inlineFlexx' does not exist
position('sticky'); // ❌ a keyword is not something you pass in
```

Two consequences worth knowing:

- **`overflow` is not in the table.** The only road to `overflow-block: auto` is
  `provides(scrollPort.block)` — see [obligations](./obligations.md). The wrong
  fix is not discouraged, it cannot be written.
- **124 helpers are narrower than CSS.** A grammar alternative the generator
  cannot close is dropped rather than approximated, so a helper may refuse a
  form CSS would accept. It can never produce CSS a browser rejects. The list is
  exported as `NARROWED_PROPERTIES`.

A few values the table cannot type on its own have constructors:

- `gradient.linear`, `.radial`, `.repeatingLinear`, `.repeatingConic`, written
  with `bgImage(...)` — several images make several layers, and `bgSize` /
  `bgPosition` take one inline and one block value;
- `uaScheme.light` / `.dark` for `color-scheme`, so native controls follow the
  theme;
- `spanAllColumns` for `grid-column: 1 / -1`;
- `pseudo.content.attr(ident('data-x'))` for a `::before` / `::after` whose text
  is an attribute the template writes.

## Typed custom properties

```ts
import { color, cssVars, kind, p, palette, unit } from '@craft-ts/style';

export const v = cssVars('badge', {
  ink: kind.color(palette.text.strong),
  pad: kind.length(unit.px(16)),
});

color(v.ink); // ✅ the token carries its kind's brand
p(v.ink); // ❌ a <color> variable is not a length
v.ink.or(space(4)); // ❌ the fallback is typed against the same kind
```

Two rules the browser enforces and the types cannot:

**A registered `initial-value` must be computationally independent.**
`initial-value: 1rem` makes the whole `@property` rule invalid and the browser
drops it _silently_ — the variable stops being registered, `var(--x)` resolves to
nothing, and whatever reads it computes to zero. `cssVars` refuses a relative
unit there and names the fix.

**`inherits: false` is the right default, and wrong for a theme.** A variable an
element sets and reads on itself should not inherit: it bounds invalidation. A
theme variable is the opposite — set once on a wrapper, read by everything
below — so pass `{ inherits: true }`. A non-inheriting theme hands every
descendant the initial value, which looks exactly like dark mode not working,
with no error anywhere.

## Variables owned by the host page {#host-variables}

A view embedded in a host application often has to paint with the host's
theme — `--host-accent`, `--host-surface-1` — which the host declares,
registers and switches at run time. A view never reads such a variable
directly, and never re-declares it with `cssVars`: that would register the
host's variable a second time with CraftTS's `syntax`, `inherits` and initial
value, in conflict with the host's own registration.

Written as a string, the read is refused by `craft-ts/no-raw-css-value`
(`rawVar`). Read any other way, the architecture rule `no-dangling-css-vars`
reports it:

```text
'--host-accent' is read by a sheet and declared by none, so nothing types,
registers or checks it, and the read resolves to nothing unless something
outside CraftTS defines it. If the variable belongs to this view, declare it
with cssVars(...) and read the token. If it belongs to the host page, do not
read it from a view: consume the host's shared CraftTS style contract — import
its tokens and axes from the host's *.style.ts or its package's /style entry.
If the host does not use CraftTS, write an adapter: a *.style.ts that declares
the contract with cssVars(...) and fills it from the host's variables, so views
read only the contract.
```

There is deliberately no API to read an arbitrary host variable from a view.
The view consumes a **style contract** instead — typed tokens and axes, part of
the same model as its own — and who provides that contract depends on the host.

### The host uses CraftTS: import its contract

The host declares its theme once, as the tokens and axes every view below it
reads, in a `*.style.ts` — or in the `/style` entry of its package:

<<< @/tests/snippets/guide/style/host-variables/shell.style.ts#contract

The view imports that contract and spends it like its own tokens; the host's
axis becomes a point of the view's visual matrix:

<<< @/tests/snippets/guide/style/host-variables/banner.style.ts#view

The variables are declared once, by their owner, and every read is checked
against that declaration.

### The host does not use CraftTS: write an adapter

When the host only has CSS variables, the view's project provides the contract
itself, in one adapter module. The adapter declares the contract with
`cssVars` — registered, typed, owned by the project — and fills it on `:root`
from the host's variables. Those are read through `defineVarTokens`, which
builds typed `var(--{prefix}-{key})` tokens **without** registering them or
emitting an `@property`, so the host keeps its own registration:

<<< @/tests/snippets/guide/style/host-variables/host-adapter.style.ts#adapter

Views import the adapter's contract, never the host's variables:

<<< @/tests/snippets/guide/style/host-variables/panel.style.ts#adapted-view

What this buys and what to know:

- **One place reads the host.** The emitted CSS registers `--hostTheme-accent`
  and sets `:root { --hostTheme-accent: var(--host-accent) }`; nothing else
  names `--host-accent`. When the host renames a variable, only the adapter
  changes.
- **A missing host variable is not a broken view.** If the host does not
  define `--host-accent`, the registered contract variable falls back to its
  initial value (`palette.accent.info` here) instead of resolving to nothing.
- **The mapping lives on `:root`.** The view follows a host theme switched on
  the document. A host that re-themes only a subtree needs that subtree's
  values mapped too.
- **The host's names must read as `--{prefix}-{key}`.** `--host-surface-1` is
  `defineVarTokens('host', { 'surface-1': … })`. `defineVarTokens` belongs in
  the adapter only: a view sheet that reads its tokens is reported by
  `no-dangling-css-vars` like any other undeclared read.
- When the host team can edit its own CSS, the same mapping can live there
  instead — `--hostTheme-accent: var(--host-accent)` in the host's stylesheet —
  and the adapter shrinks to the `cssVars` contract.
