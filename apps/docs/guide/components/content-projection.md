# Content projection

Projection is a **rendering context, not a category of component**. The same
`craftComponent` can be rendered directly or supplied into a compatible logical
slot — its definition doesn't change either way.

**Use it when** a component composes content it doesn't own: a card with a
caller-supplied body, a toolbar filled with actions, a dialog with its buttons.
**Not when** the child is fixed — just render it.

Both forms go through one primitive:

```ts
renderContent(value);
```

It accepts either deferred DOM content (`RenderableContent`) or a component unit
exposing a logical contract. There is **no runtime registry** like
`contentChildren`, and no special projection component.

## The common case — free DOM content

`ContentSlot` describes optional or free-form DOM content. `RequiredContent`
adds a structural contract that TypeScript checks.

```typescript
import {
  content,
  craftComponent,
  div,
  renderContent,
  section,
  type ContentSlot,
  type RequiredContent,
} from '@craft-ts/component';

type CardInput = {
  readonly header?: ContentSlot;
  readonly body: RequiredContent<{
    readonly selector: {
      readonly tag: 'div';
      readonly 'data-slot': 'body';
    };
  }>;
};

const Card = craftComponent(
  'Card',
  {},
  (input: CardInput) => input,
  ({ header, body }) =>
    section([
      header ? renderContent('header', header) : 'Default title',
      renderContent('body', body),
    ]),
);

Card({
  header: content(() => div('Title supplied by the caller')),
  body: content(() => div({ 'data-slot': 'body' }, 'Card content')),
});
```



The selector is analysed **statically**. This is rejected, because it does not
contain `div[data-slot="body"]`:

```ts
Card({
  // @ts-expect-error the content does not satisfy the slot's DOM contract.
  body: content(() => div({ 'data-slot': 'footer' })),
});
```

The contract names an attribute, not a class. A class comes from a sheet and is
a list of atoms — not a name a selector can require — while a `data-*`
attribute is a stable, declared part of the markup.

Content can be built from arrays, conditions, loops and templates — the analysis
looks for the selector in every rendered branch:

```ts
const body = content(() => [
  showIntro() ? div({ 'data-slot': 'body' }, 'Introduction') : undefined,
  forNode(rows(), { track: (row) => row.id }, (row) =>
    div({ 'data-slot': 'body' }, row.label),
  ),
  renderTemplate(cardRowTemplate, { $implicit: selectedRow() }),
]);

Card({ body });
```

The constraint creates no wrapper and adds no runtime validation. DOM contracts
and logical contracts are independent:

```text
RequiredContent<Requirement>  → the shape of the DOM supplied
ProjectionOf<Component>       → the logical capabilities of a component
```

## Logical projection by contract

A component becomes projectable when its logic factory returns a `contract`
property, built and checked with `satisfies`.

<<< @/tests/snippets/guide/components/content-projection/toolbaraction.spec.ts#toolbaraction


`ProjectionContractOf<Component>` extracts the type of `logicOutput.contract`.
`ProjectionOf<Component>` adds the stable key the renderer expects. For generic
consumers, `ProjectionSlot<Contract>` directly describes a collection of
compatible units.

Projection therefore depends on **neither** the component's name, **nor** a
`projection` metadata field, **nor** a runtime registry.

## Explicit collections, order and stable keys

The consuming component receives a typed collection explicitly. Each unit must
supply a **stable key**, which `forNode` uses to reuse, move or remove the right
projection.

```ts
import {
  craftComponent,
  div,
  forNode,
  renderContent,
  type ProjectionOf,
} from '@craft-ts/component';

const Toolbar = craftComponent(
  'Toolbar',
  {},
  (input: {
    readonly actions: readonly ProjectionOf<typeof ToolbarAction>[];
  }) => input,
  ({ actions }) =>
    div(
      { role: 'toolbar' },
      forNode(actions, { track: (action) => action.key }, (action) =>
        renderContent(action),
      ),
    ),
);

Toolbar({
  actions: [
    ToolbarAction({ key: 'save', content: () => 'Save', trigger: save }),
    ToolbarAction({ key: 'cancel', content: () => 'Cancel', trigger: close }),
  ],
});
```

The same `ToolbarAction` stays usable on its own:

```ts
const Page = craftComponent(
  'Page',
  {},
  () => ({}),
  () => [
    ToolbarAction({
      key: 'standalone',
      content: () => 'Direct action',
      trigger: save,
    }),
    Toolbar({
      actions: [
        ToolbarAction({
          key: 'projected',
          content: () => 'Projected action',
          trigger: save,
        }),
      ],
    }),
  ],
);
```

## Styling projected content

The component styles **its own frame** around the slot; the content is styled
by whoever writes it, with their own sheet. What the frame offers its content
travels the way everything crosses a component boundary in `@craft-ts/style`:
inherited properties — `color`, fonts — and variables declared with
`{ inherits: true }` that the content's sheet chooses to read.

<<< @/tests/snippets/guide/components/content-projection/styledcard.style.ts#sheet

<<< @/tests/snippets/guide/components/content-projection/styledcard.spec.ts#styledcard

Nothing reaches into the content: a caller that does not read
`styledCardVars.accent` is unaffected by it, and a nested Craft component keeps
its own classes. The deprecated `contentStyles` meta — CSS strings pushed into a
slot — is refused by `no-component-css`.

## Pitfalls

**Forgetting the stable key.** Without it the renderer cannot tell one projected
unit from another across updates, and reuse breaks.

**Expecting a plain component to satisfy a contract slot.** It stays perfectly
usable as a direct child, but the slot rejects it:

```ts
const PlainCard = craftComponent(
  'PlainCard',
  {},
  () => ({}),
  () => 'Card with no contract',
);

Toolbar({
  actions: [
    // @ts-expect-error PlainCard does not expose ToolbarActionContract.
    PlainCard({}),
  ],
});
```

An incomplete contract is rejected where it is declared:

```ts
const invalidContract = {
  kind: 'toolbar-action',
  // @ts-expect-error trigger and disabled are required.
} satisfies ToolbarActionContract;
```

::: details Combining optional content and contractual actions — a dialog
A component can mix optional DOM content with several logical slots in one
explicit collection:

```ts
const Dialog = craftComponent(
  'Dialog',
  {},
  (input: {
    readonly body?: ContentSlot;
    readonly actions: readonly ProjectionOf<typeof ToolbarAction>[];
  }) => input,
  ({ body, actions }) =>
    section({ role: 'dialog' }, [
      body ? renderContent(body) : [],
      footer(
        forNode(actions, { track: (action) => action.key }, (action) =>
          renderContent(action),
        ),
      ),
    ]),
);

Dialog({
  body: content(() =>
    div(['Delete the account', 'This action cannot be undone.']),
  ),
  actions: [
    ToolbarAction({ key: 'cancel', content: () => 'Cancel', trigger: closeDialog }),
    ToolbarAction({ key: 'delete', content: () => 'Delete', trigger: deleteAccount }),
  ],
});
```

`closeDialog` and `deleteAccount` are captured by the caller's closures.
Projection preserves the lexical context **and the injector** of wherever the
unit or the content was declared.
:::

::: details Conditions, reactivity and cleanup
Projections are ordinary Craft nodes, so they can sit inside conditions and
templates while keeping their identity by key within a collection. Here `visible`
is a callable reactive value supplied by the caller:

```ts
const OptionalToolbar = craftComponent(
  'OptionalToolbar',
  {},
  (input: {
    readonly visible: () => boolean;
    readonly actions: readonly ProjectionOf<typeof ToolbarAction>[];
  }) => input,
  ({ visible, actions }) =>
    visible()
      ? forNode(actions, { track: (action) => action.key }, (action) =>
          renderContent(action),
        )
      : [],
);
```

On update the renderer adds, removes and moves projections by key. On teardown
the projected content, its effects and its styles are cleaned up with the rest
of the tree.
:::

## API summary

- `content(renderer, options?)` — create deferred DOM content
- `renderContent(value)` and `renderContent(slotName, value)` — render it
- `RenderableContent`, `ContentSlot` — free-form slots
- `RequiredContent<Requirement>` — static DOM contracts
- `ProjectionContractOf<Component>` — extract a logical contract
- `ProjectionOf<Component>`, `ProjectionSlot<Contract>` — type projectable
  collections

The older fragment and slot primitives are no longer part of the public API.

## See Also

- [Customization](/guide/components/customization)
- [Styling a component](/guide/components/styles)
- [Directives and `.pipe(...)`](/guide/components/directives)
