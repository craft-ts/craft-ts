# Encapsulated styles

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

## See Also

- [Customization](/guide/components/customization) — the three layers
- [Directives and `.pipe(...)`](/guide/components/directives)
