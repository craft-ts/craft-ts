# Customizing components and directives

Craft splits customization into three layers, and which one you reach for
depends on how far the change should travel:

| Layer                 | Changes                               |
| --------------------- | ------------------------------------- |
| Root-element `host`   | The component's own root defaults     |
| A `*.style.ts` sheet  | Its appearance                        |
| Composable directives | Behaviour, reusable across components |

**Start with `host`** for one component's defaults, and move to a directive only
when the same customization needs to apply somewhere else too.

## Customizing the root element

The component meta `host` properties define defaults for the component’s root
element. The caller can extend or override them:

<<< @/tests/snippets/guide/components/customization/card.style.ts#sheet

<<< @/tests/snippets/guide/components/customization/card.spec.ts#card

Classes, attributes, styles, and events recognized as host properties are
applied to the component root. Other properties remain factory props. A caller's
`class` is **added** to the host's, so the two classes must not write the same
property — `featured` writes the border, which `root` leaves alone. Everything
else, `attrs` included, replaces the host's value.

Values can be reactive. The class stays constant; what moves is an attribute the
sheet reads as an axis:

```ts
Card({
  class: cardSheet.featured,
  'data-cardActive': function* () {
    return String(yield* active());
  },
});
```

## Customizing the appearance

A component's look lives in a sheet beside it and nowhere else — see
[Styling a component: the only way](/guide/components/styles). The template
binds the sheet's classes:

```typescript
import { panel } from './panel.style';

const Panel = craftComponent(
  'Panel',
  {},
  () => ({}),
  () =>
    div({ class: panel.root }, [
      h2({ class: panel.title }, 'Panel'),
      button('save', { class: panel.action, type: 'button' }, 'Save'),
    ]),
);
```

A sheet's classes are atomic: they apply where they are bound and nowhere else,
so there is no scope to manage and nothing leaks into a child component.

## Adding reusable customization with a directive

A directive transforms a component’s factory and template. It is applied from
left to right with `.pipe(...)`:

```ts
import { highlight } from './highlight.style';

const Highlight = craftDirective(
  'Highlight',
  {},
  (baseLogic) => baseLogic,
  (baseTemplate) => (context) =>
    baseTemplate(context, { class: highlight.root }),
);

const HighlightedPanel = Panel.pipe(Highlight);
```

A directive can also add context and public props:

```ts
const WithPermission = craftDirective(
  'WithPermission',
  {},
  (baseLogic) => (user: Input<User>) => ({
    ...baseLogic(user),
    canEdit: () => user().permissions.includes('edit'),
  }),
  (baseTemplate) => (context) =>
    context.canEdit() ? baseTemplate(context) : [],
);

const EditablePanel = Panel.pipe(WithPermission);
```

A directive brings its own sheet and adds its class to the host's, so the same
directive can be reused by several components without introducing an HTML
wrapper.

## Composing providers and exception handlers

`withProviders` configures the provider scope of a component before it is
invoked. `catchTag.exhaustive` is a logic boundary: each handler is a
generator that can call a service or perform another logic operation. It must
not return template children. Use `catchNode.exhaustive` or
`matchNode.exhaustive` when the exception should produce DOM.

```ts
import { abstract, craftException, craftService } from '@craft-ts/core';
import {
  catchTag,
  craftComponent,
  p,
  withProviders,
} from '@craft-ts/component';

const noAccess = craftException({ _tag: 'NO_ACCESS' });
const { RestrictedData, provideRestrictedData } = craftService(
  { name: 'restrictedData', scope: 'abstract' },
  abstract<string | typeof noAccess>(),
);

const MyRestrictedCraftComponent = craftComponent(
  'MyRestrictedCraftComponent',
  {},
  function* () {
    return { value: yield* RestrictedData() };
  },
  ({ value }) => p(`Private data: ${value}`),
);

const Restricted = MyRestrictedCraftComponent.pipe(
  withProviders([
    provideRestrictedData(() =>
      currentUserCanRead() ? 'available' : noAccess,
    ),
  ]),
  catchTag.exhaustive({
    NO_ACCESS: function* () {
      // yield* ToastService.show(() => 'No access');
    },
  }),
);

Restricted();
```

Providers are evaluated before the component template. If a provider reads a
signal, changing that signal recreates the composed rendering, including the
provider scope. The handler generator runs for the exception state. Since
`catchTag` does not render a template, use `catchNode` or `matchNode` for a
visual fallback.

The component adapter reuses the exhaustive `catchTag` rules from the core and
the composed component carries the exception codes produced by its initializer
and providers. The providers also participate in the normal Craft DI graph, so
they can satisfy dependencies used by the component and its children. The
variadic component `.pipe(...)` overload is currently kept permissive to avoid
excessive TypeScript instantiation depth; runtime dispatch still rejects an
unhandled exception code.

## Choosing an exception utility

Craft exposes three complementary utilities. The important distinction is
whether the exception is handled in logic or rendered in a template:

- `catchTag.exhaustive` handles component initialization exceptions in logic;
- `catchNode.exhaustive` creates a template boundary and can insert a fallback
  before or after its source block;
- `matchNode.exhaustive` renders a fallback from an exception value or signal.

### `catchTag.exhaustive`: logic only

Handlers are generator functions. They can call services and yield other Craft
operations, but they cannot return `p(...)`, an element, or any other template
children. A DOM fallback belongs to `catchNode` or `matchNode`.

```ts
const SafeComponent = MyRestrictedCraftComponent.pipe(
  withProviders([
    provideRestrictedData(() =>
      currentUserCanRead() ? 'available' : noAccess,
    ),
  ]),
  catchTag.exhaustive({
    NO_ACCESS: function* (exception) {
      yield* ToastService.show(() => `Access denied: ${exception._tag}`);
    },
  }),
);
```

### `catchNode.exhaustive`: preserve a source block

Apply it to a rendered VNode when the source subtree may throw. The source is
kept and the fallback is inserted at the requested position. Applying it to a
component in `.pipe(...)` also creates a residual component boundary and
removes the handled codes from the component and route contracts.

```ts
const view = SourceComponent({}).pipe(
  catchNode.exhaustive(
    {
      UserNotFoundException: () => p('User not found'),
    },
    { position: 'after' },
  ),
);
```

For a template boundary, the source block remains visible by default. When
`catchNode` is piped onto a component and the exception comes from its
composed scope, a function handler keeps the existing component behavior and
replaces the source. A handler can keep that source visible by using the object
form and setting `showSource: true`:

```ts
const view = SourceComponent({}).pipe(
  catchNode.exhaustive({
    UserNotFoundException: {
      render: () => p('User not found'),
      showSource: true,
      position: 'after',
    },
  }),
);
```

With `showSource: true`, the source and fallback are both rendered. Use
`showSource: false` to hide the source explicitly. `position` can be set on
each handler (`before` or `after`); the second argument remains available as a
default for handlers that do not specify their own position. Existing function
handlers keep their previous behavior. If the component factory or a provider
fails before the template is created, there is no source block to preserve, so
the fallback is rendered alone.

### `matchNode.exhaustive`: render a resource exception

Use it when a query, mutation, or another primitive exposes an exception as a
signal instead of throwing from the template subtree. The block renders no
children while the source is empty and switches reactively to the matching
handler when an exception appears.

```ts
matchNode.exhaustive(() => userQuery.exceptions().loader, '_tag', {
  UserNotFoundException: () => p('User not found'),
  UserConsentMissingException: () => p('Consent is required'),
});
```

## What Craft handles directly

Craft supports compositions that are not native properties of a standard
the host component or directive:

- a Craft directive can add its own classes to the root of the component using
  it, without a wrapper;
- multiple directives can compose their logic, template and host classes
  through `.pipe(...)`;
- the CSS itself is emitted once, at build time, by the `@craft-ts/style`
  plugin: nothing is injected or reference-counted at runtime.

## Choosing the right level

- `host`: identity, attributes, classes, or behavior of the root element;
- a `*.style.ts` sheet: the component's appearance, its variants as axes, its
  runtime values as typed variables;
- `craftDirective`: behavior or customization reusable across components;
- the factory: component-specific state and dependencies.

### How a parent reaches a child

A parent never styles a child's internals. It has two doors, both visible in
the child's contract: a class it passes to the child's host, and a variable
declared with `{ inherits: true }` that the child's sheet reads.

<<< @/tests/snippets/guide/components/customization/card-2.style.ts#sheet

<<< @/tests/snippets/guide/components/customization/card-2.spec.ts#card-2

The card sets `data-cardActive`, its sheet writes `cardVars.ink`, and the title,
a separate component, reads it. Nothing in the card knows how the title is
built.

Names passed to `craftComponent` and `craftDirective` must be unique and match
their declaration names. The dedicated ESLint rules detect missing or
inconsistent names.

## See Also

- [Styling a component](/guide/components/styles)
- [Directives and `.pipe(...)`](/guide/components/directives)
- [Content projection](/guide/components/content-projection)
