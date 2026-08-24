# Template migrator

Paste an HTML snippet or a web component from a UI library's documentation. The
converter generates the equivalent Craft functional template and the imports it
needs from `@craft-ts/component`.

**Use it to** bring markup from outside — a design system's docs, a CodePen, an
existing template markup — into Craft's template syntax without transcribing it
by hand.

<CraftTemplateMigrator />

## What it produces

By default the result is a callback to paste as the fourth argument of
`craftComponent(...)`. Fill in a name to generate a complete component instead.

Native HTML tags become the matching helpers (`div`, `button`, `section`, …);
custom tags become `customElement('my-element', ...)`.

## Pitfalls

**Interpolations and bindings are preserved as expressions**, not translated.
Adapt them to your Craft context.

**Control-flow directives are not converted.** Rewrite conditional and repeated
sections with `ifNode` or `forNode`.

## See Also

- [Directives and `.pipe(...)`](/guide/components/directives)
- [CLI automation](/guide/routing/automation) — codemods for the rest of a migration
