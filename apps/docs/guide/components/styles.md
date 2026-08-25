# Encapsulated styles

::: tip Two style systems, and which to pick
This page is `meta.styles`: a **string** of CSS shipped with the component and
scoped with `@scope`. It is the shortest path to a component's own appearance,
and it needs no build step.

[`@craft-ts/style`](../style/) is the other one: values are typed objects, the
CSS is emitted at build time, and the exhaustive set of a component's visual
states becomes something you can enumerate and test. It costs a Vite plugin and
a design system to declare.

Pick this page for a component whose look is settled and local. Pick
`@craft-ts/style` when the variants are a matrix you need to prove you covered.
They coexist: a component can carry `meta.styles` and bind a sheet class.
:::

Styles declared in `craftComponent(name, meta, factory, template)` are shared by
every instance of the component and encapsulated with CSS `@scope`. The registry
keeps a single sheet per component and removes it when the last instance is
destroyed.

**Use it for** a component's own appearance.
**Not for** application-wide styles — those belong in your global stylesheet;
scoping them here just makes them harder to find.

## The common case

```ts
const Card = craftComponent(
  'Card',
  { styles: ':scope { padding: 1rem } .title { font-weight: 700 }' },
  () => ({}),
  () => div([h2({ class: 'title' }, 'Title')]),
);
```

The template root is written `:scope`. Craft adds **no host element and no
wrapper** — roots carry an internal `data-craft-root` attribute, which you must
never set yourself.

## Composing styles from a directive

A directive's styles compose with the component's:

```ts
const Highlight = craftDirective(
  'Highlight',
  { styles: '.highlight { background: yellow }' },
  (baseLogic) => baseLogic,
  (baseTemplate) => (context) => baseTemplate(context, { class: 'highlight' }),
);
```

## Pitfalls

**`@scope` adds no specificity.** Adopted sheets are ordered after the document's
sheets, and the `<style>` fallback is inserted in the `head`. Nested-scope
proximity can therefore change the cascade compared with a global stylesheet —
if a rule stops winning after you scope it, this is why.

**Sibling roots can't see each other.** Multi-root templates are allowed, but
relationships between sibling roots (`header + main`, say) are not expressible
through this encapsulation.

**A root that is itself a Craft component carries several tokens**, so the
enclosing component can reach inside it. This is a known limit of the current
implementation.

**Names must be unique.** The `craft-component-name-match` and
`craft-directive-name-match` rules also check that the name matches the
declaration.

**Hoisted rules are still global.** Craft rejects `@import`, document-root
selectors, and private at-rules whose names are not prefixed by the component
scope. A `Spinner` animation is named `@keyframes Spinner-spin`. Component
`@property` registrations keep their public custom-property name, but that name
must belong to the component namespace.

## See Also

- [Customization](/guide/components/customization) — the three layers
- [Typed CSS variables and design tokens](/guide/components/css-variables)
- [Directives and `.pipe(...)`](/guide/components/directives)
