# Customizing components and directives

Craft separates component customization into three layers: root-element
properties, encapsulated styles, and composable directives.

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
const active = state(false, ({ set }) => ({ set }));

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
`@keyframes`, `@font-face`, and `@import` are kept outside the scoped block;
`@media`, `@supports`, and `@container` remain composable inside the scope.

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
