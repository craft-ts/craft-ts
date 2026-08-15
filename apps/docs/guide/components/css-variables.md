# Typed CSS variables and design tokens

CSS custom properties are the public styling API of a Craft component. Craft
extracts a contract from inline `meta.styles`, propagates unsatisfied variables
through component templates, and applies supplied values to the component root.
The browser's native inheritance then carries them to descendants.

## Required and optional variables

An unguarded use is required. A declaration or inline fallback is optional:

<<< @/tests/snippets/guide/components/css-variables/card.spec.ts#card


`--card-ink` is required, while `--card-bg` and `--card-radius` are optional.
Styles supplied through `cssVars` are written as custom properties on the
component root; different instances can therefore use different values while
sharing one scoped stylesheet.

## External stylesheets

An imported stylesheet is typed as `string`, so TypeScript cannot inspect it.
Declare its contract explicitly with `required()`:

```typescript
craftComponent(
  'ExternalCard',
  {
    stylesUrl: styles,
    cssVars: {
      '--external-card-ink': required<string>(),
      '--external-card-gap': '1rem',
    },
  },
  () => ({}),
  template,
);
```



The `craft-css-vars-contract` lint rule resolves the CSS import and checks that
the explicit contract and file remain synchronized.

## Child-variable dispositions

At a child call site, every variable can be handled deliberately:

```ts
Badge({ cssVars: { '--badge-ink': 'navy' } });
Badge({ cssVars: { '--badge-ink': inherit } });
Badge({ cssVars: { '--badge-ink': omit } });
Badge({ cssVars: { '--badge-ink': forward('navy') } });
Badge({ cssVars: { '--badge-bg': forward() } });
```

- A value supplies the child directly.
- `inherit` uses a declaration in the current component's own styles and emits
  no inline value.
- `omit` intentionally stops propagation and emits nothing.
- `forward(value)` gives the parent API a default that callers can override.
- `forward()` re-exposes an optional value without adding a default.

Use `assertCssVarsSatisfied(routes)` next to the other route proofs. It rejects
a routed root when a required variable has propagated all the way to a mount
that has no component call site.

## `@property`: validation versus requiredness

Craft reads authored `@property` blocks; it does not generate them. A registered
property with a non-wildcard syntax needs an `initial-value`, so it is optional
by construction:

```css
@property --meter-value {
  syntax: '<number>';
  inherits: true;
  initial-value: 0;
}
```

Registration provides browser validation, animation support, and an initial
value. The tradeoff is that it gives up the compile-time “nobody supplied this”
error. `inherits: false` cannot be used for a variable supplied or forwarded by
a parent.

`@property` is document-global even when its values cascade normally. A
component may therefore register only variables in its own namespace
(`Meter` → `--meter-*`). Register shared design tokens once in the application's
global stylesheet, whose lifetime matches the document.

## Scope safety

Craft rejects component CSS that can silently become global:

- `@import`, `:root`, `html`, and `body`;
- unprefixed `@keyframes`, `@counter-style`, font palettes, or font families;
- `@property` registrations outside the component namespace;
- `!important` in component styles.

Private global names use the exact component scope, for example
`@keyframes Spinner-spin`. Craft validates these names rather than rewriting
CSS declaration values at runtime.
