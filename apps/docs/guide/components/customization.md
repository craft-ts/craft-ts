# Customizing components and directives

Craft splits customization into three layers, and which one you reach for
depends on how far the change should travel:

| Layer                 | Changes                               |
| --------------------- | ------------------------------------- |
| Root-element `host`   | The component's own root defaults     |
| Encapsulated `styles` | Its internal appearance               |
| Composable directives | Behaviour, reusable across components |

**Start with `host`** for one component's defaults, and move to a directive only
when the same customization needs to apply somewhere else too.

## Customizing the root element

The component meta `host` properties define defaults for the component’s root
element. The caller can extend or override them:

```ts
const Card = craftComponent(
  'Card',
  {
    host: {
      class: 'card card--default',
      attrs: { role: 'article' },
    },
  },
  () => ({}),
  () => div([h2('A card')]),
);

Card({
  class: 'card--featured',
  attrs: { 'data-testid': 'featured-card' },
});
```

Classes, attributes, styles, and events recognized as host properties are
applied to the component root. Other properties remain factory props.

Values can be reactive:

```ts
const { active } = state('active', false, ({ set }) => ({ set }));

Card({
  class: () => (active() ? 'is-active' : 'is-idle'),
  style: () => ({ opacity: active() ? 1 : 0.6 }),
});
```

## Customizing with styles

Styles declared in `meta.styles` are shared across instances and encapsulated
with `@scope`. The template root is written as `:scope`:

```ts
const Panel = craftComponent(
  'Panel',
  {
    styles: `
      :scope { padding: 1rem; border: 1px solid #ddd; }
      .title { font-weight: 700; }
      button { cursor: pointer; }
    `,
  },
  () => ({}),
  () => div([h2({ class: 'title' }, 'Panel'), button('Save')]),
);
```

Styles do not leak into descendant components. Global rules such as
`@keyframes` and `@font-face` cannot be nested in `@scope`, so their private
names must start with the component scope. `@import` and document-root selectors
are rejected. `@media`, `@supports`, and `@container` remain composable inside
the scope. For the typed styling API, see
[Typed CSS variables and design tokens](/guide/components/css-variables).

## Adding reusable customization with a directive

A directive transforms a component’s factory and template. It is applied from
left to right with `.pipe(...)`:

```ts
const Highlight = craftDirective(
  'Highlight',
  {
    styles: '.highlight { background: #fff3bf; }',
  },
  (baseLogic) => baseLogic,
  (baseTemplate) => (context) => baseTemplate(context, { class: 'highlight' }),
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

Directive styles are registered in the scope of the component that owns them.
The same directive can therefore be reused by several components without
introducing an HTML wrapper.

## Composing providers and exception handlers

`withProviders` configures the provider scope of a component before it is
invoked. `catchTag.exhaustive` is a logic boundary: each handler is a
generator that can call a service or perform another logic operation. It must
not return template children. Use `catchBlock.exhaustive` or
`matchBlock.exhaustive` when the exception should produce DOM.

```ts
import { abstract, craftException, craftService } from '@craft-ng/core';
import {
  catchTag,
  craftComponent,
  p,
  withProviders,
} from '@craft-ng/component';

const noAccess = craftException({ code: 'NO_ACCESS' });
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
`catchTag` does not render a template, use `catchBlock` or `matchBlock` for a
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
- `catchBlock.exhaustive` creates a template boundary and can insert a fallback
  before or after its source block;
- `matchBlock.exhaustive` renders a fallback from an exception value or signal.

### `catchTag.exhaustive`: logic only

Handlers are generator functions. They can call services and yield other Craft
operations, but they cannot return `p(...)`, an element, or any other template
children. A DOM fallback belongs to `catchBlock` or `matchBlock`.

```ts
const SafeComponent = MyRestrictedCraftComponent.pipe(
  withProviders([
    provideRestrictedData(() =>
      currentUserCanRead() ? 'available' : noAccess,
    ),
  ]),
  catchTag.exhaustive({
    NO_ACCESS: function* (exception) {
      yield* ToastService.show(() => `Access denied: ${exception.code}`);
    },
  }),
);
```

### `catchBlock.exhaustive`: preserve a source block

Apply it to a rendered VNode when the source subtree may throw. The source is
kept and the fallback is inserted at the requested position. Applying it to a
component in `.pipe(...)` also creates a residual component boundary and
removes the handled codes from the component and route contracts.

```ts
const view = SourceComponent({}).pipe(
  catchBlock.exhaustive(
    {
      UserNotFoundException: () => p('User not found'),
    },
    { position: 'after' },
  ),
);
```

For a template boundary, the source block remains visible by default. When
`catchBlock` is piped onto a component and the exception comes from its
composed scope, a function handler keeps the existing component behavior and
replaces the source. A handler can keep that source visible by using the object
form and setting `showSource: true`:

```ts
const view = SourceComponent({}).pipe(
  catchBlock.exhaustive({
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

### `matchBlock.exhaustive`: render a resource exception

Use it when a query, mutation, or another primitive exposes an exception as a
signal instead of throwing from the template subtree. The block renders no
children while the source is empty and switches reactively to the matching
handler when an exception appears.

```ts
matchBlock.exhaustive(() => userQuery.exceptions().loader, 'code', {
  UserNotFoundException: () => p('User not found'),
  UserConsentMissingException: () => p('Consent is required'),
});
```

## What Craft handles directly

Craft supports compositions that are not native properties of a standard
Angular component or directive:

- a Craft directive can declare `meta.styles` and contribute to the stylesheet
  of the component using it; Angular associates styles with a component, not
  with an `@Directive`;
- directive styles remain encapsulated with `@scope`, without rewriting
  selectors or adding a wrapper;
- multiple directives can compose their logic, template, host classes, and
  styles through `.pipe(...)`;
- styles are deduplicated and reference-counted across instances, then removed
  when the last instance is destroyed.

With standard Angular, this usually requires moving styles into a component,
manually adding classes to the host, or managing stylesheet injection and
cleanup yourself. Craft keeps those responsibilities in the directive runtime.

## Choosing the right level

- `host`: identity, attributes, classes, or behavior of the root element;
- `styles`: local, reusable component appearance; the stylesheet is shared
  across instances, while its rules remain limited to the component roots;
- `craftDirective`: behavior or customization reusable across components;
- the factory: component-specific state and dependencies.

### Understanding style scope

Inside `meta.styles`, `:scope` targets every root produced by the template:

```ts
const Card = craftComponent(
  'Card',
  {
    styles: `
      :scope { padding: 1rem; }
      .title { color: navy; }
      .title strong { font-weight: 700; }
    `,
  },
  () => ({}),
  () => div([h2({ class: 'title' }, [strong('Card')])]),
);
```

Craft puts an internal token on the roots and generates a scope equivalent to:

```css
@scope ([data-craft-root~="Card"]) to ([data-craft-root] *) {
  /* Card rules */
}
```

In practice:

- `:scope` targets the root itself;
- `.title` targets `Card` descendants;
- when a child Craft component or Angular component is encountered, its host
  becomes a boundary: parent rules can reach the host, but not its internal
  DOM;
- ordinary elements do not become boundaries and do not receive an additional
  token;
- a template returning multiple roots scopes each root, but cannot express a
  relationship between sibling roots such as `header + main`;
- a root that is directly another Craft component can carry multiple tokens.
  The containing component can then reach into the child component: this is a
  known limitation of the current model.

Scoping is structural, not based on selector rewriting: modern selectors such
as `:is()`, `:where()`, `&`, and nested rules are not transformed by Craft.
`@media`, `@supports`, and `@container` remain inside the scope; rules that
cannot be nested there, such as `@keyframes`, `@font-face`, `@import`, and
`@namespace`, are hoisted outside the `@scope` block.

Directive styles use the scope of their owning component because a directive
does not introduce a separate root node. A directive can add `.highlight` or
modify `:scope`, but `:scope` then refers to the host component’s roots, not to
a directive wrapper.

Names passed to `craftComponent` and `craftDirective` must be unique and match
their declaration names. The dedicated ESLint rules detect missing or
inconsistent names.

## See Also

- [Encapsulated styles](/guide/components/styles)
- [Directives and `.pipe(...)`](/guide/components/directives)
- [Content projection](/guide/components/content-projection)
