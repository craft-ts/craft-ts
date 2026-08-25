# Tokens and typed variables

Level 1. Useful from the first component, and it does not require anything else
in the app to change.

## No value is a string

Every value is a **nominal object**, not a branded string:

```ts
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
unsafeLength('13px', 'aligns with a legacy image');
```

It compiles, and it propagates `unproven` to the dependency graph, where the
debt is counted. Without this door a blocked agent bypasses the design system
entirely; with it unmarked, it bypasses it in silence.

## The property table is generated

477 properties, generated from MDN data — which is what guarantees no keyword
was invented. A closed keyword set is a namespace, never a string:

```ts
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

## Typed custom properties

```ts
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
