# Typed CSS variables

A component's styling API is a set of **typed custom properties** declared with
[`cssVars`](../style/define.md#the-theme) in its sheet. Each one has a kind — a
colour, a length, a percentage — and a typed initial value, registered with
`@property`. None is "required": a variable nobody sets keeps its initial value,
and one nobody reads is reported by the architecture rule `no-dangling-css-vars`.

<<< @/tests/snippets/guide/components/css-variables/card.style.ts#sheet

<<< @/tests/snippets/guide/components/css-variables/card.spec.ts#card

## Per instance: a variant sets what it changes

A caller does not hand a component raw values. It picks a variant — here
`data-cardLook` — and the sheet sets the variables that variant changes with
`set(...)`. The others keep their initial value. The set of looks is therefore
closed and enumerable, which is what lets the [visual matrix](/guide/style/variants)
capture every one of them.

## Inherited: a parent sets, descendants read

`{ inherits: true }` is for a variable set once on a wrapper and read below it —
a theme, or a card that tints whatever it contains. The default, `false`, is for
a variable an element both sets and reads on itself.

## Forwarded: a parent re-exposes a child's variable

A parent that wants its own API writes `set(child, parent)`: the panel above
declares `panelVars.ink` and forwards it to `cardVars.ink`. A caller overrides
the panel's variable in its own sheet, and the card follows without the panel
knowing how the card is built.

## At runtime: `assign`

A value known only at runtime — a progress, a position, a colour picked by the
user — is written on the element with `assign(variable, value)`, the only thing
`style:` accepts. The sheet reads it like any other variable. Because the
variable is registered with its kind, the browser can interpolate it: a
`transition` on `width` driven by a percentage variable animates.

## `@property` is emitted, not written

Every variable declared with `cssVars` is emitted as an `@property` block by the
build plugin, with its syntax, its `inherits` flag and its initial value. You
never write one by hand. Two rules follow from the registration:

- an initial value must be computationally independent — `unit.px(16)`, not
  `unit.rem(1)` — or the browser drops the whole registration; the architecture
  suite catches it;
- a prefix belongs to one sheet: `cssVars` throws when two sheets declare the
  same prefix.

## `meta.cssVars`

The `cssVars` field of `craftComponent`'s meta — a contract extracted from a
CSS string, with `required()`, `inherit`, `omit` and `forward()` at the call
site — belongs to the component CSS that `no-component-css` refuses. It is
`@deprecated`, kept only so that an [attested bypass](/guide/components/styles#the-one-real-exception)
stays possible.
