# Named interactive elements

`assertInteractiveElementNamed` requires a unique literal Craft name on every
interactive element:

<<< @/tests/snippets/guide/testing/architecture/interactive-element-names.spec.ts#example

## What it prevents

This control has no stable graph or test identity:

```typescript
button({ *click() { yield* increment(); } }, '+');
```

This one is named, but two components using the same name make the app-wide
`data-craft-name` lookup ambiguous:

```typescript
button('save', { *click() { yield* save(); } }, 'Save');
```

The ambiguity matters to type-level template tests, browser tests and the live
page tooling used by coding agents. A selector based on “the second Save button”
is not a stable contract.

## What is checked

The rule covers `button`, links, form controls and nodes with `click`, `input`,
`change` or `submit`. Hidden inputs are excluded. The first argument must be a
literal string and the resulting name must be unique in the application.

```typescript
button('save-profile', { type: 'button', *click() { yield* save(); } }, 'Save');
```

Use a feature-qualified name when the control is likely to recur. ESLint catches
local omissions; the architecture rule catches duplicates across components.

## See also

- [Components](/guide/components/)
- [Live page MCP](/guide/ai/dev-page)
- [Testing components](/guide/testing/components)
