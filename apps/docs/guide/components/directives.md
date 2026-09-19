# Directives and `.pipe(...)`

A Craft directive declares **transformations**: it can change the service a
component takes, and it can wrap the template the component returns — so
behaviour and markup travel together, and compose.

**Use one when** the same behaviour must be added to several components:
a tooltip, a highlight, focus management, analytics on interaction.
**Not when** the behaviour belongs to one component — put it in that component's
own service.

Directives are applied from left to right.

```ts
import {
  button,
  craftComponent,
  craftDirective,
  div,
  p,
  type Input,
} from '@craft-ts/component';
import { overrideService } from '@craft-ts/core';
```

## The shape

```ts
craftDirective(name, meta, transforms);
```

| Key                   | What it does                                            |
| --------------------- | ------------------------------------------------------- |
| `transforms.service`  | replaces a service in the scope the directive installs  |
| `transforms.template` | wraps the template, and may decide not to render it     |

Both are optional: a directive may transform only the service, only the
template, or both.

## `InteractivePermissions`

The examples below use a directive that enriches the service a component reads
with a permission façade. Its configuration is internal to the directive; the
component caller only provides the original `user` input.

<<< @/tests/snippets/guide/components/directives/interactivepermissions.spec.ts#interactivepermissions

## Basic composition

`.pipe(...)` installs the transformation in the component's own scope:

```ts
const Card = craftComponent(
  'Card',
  { providers: [provideUserPanelView()] },
  function* (inputs: { readonly user: Input<User> }) {
    const { user } = yield* UserPanelView(inputs);
    return div(user.name);
  },
).pipe(InteractivePermissions);
```

What the component reads is resolved in the scope the directive installed:

```text
component inputs
        ↓
service the component yields
        ↓
service transform installed by the directive
        ↓
the nodes the component returns
        ↓
template transform installed by the directive
```

The service the directive overrides must be the one the component takes.
`overrideService` reaches the original instance with `skipSelf`, so the
replacement can build on it instead of duplicating it.

## Directive configuration

A fixed configuration can be supplied when the directive is created:

```ts
const hasPermission = (permission: Permission) =>
  craftDirective('hasPermission', {}, {
    service: overrideService(UserPanelView, (base) => ({
      ...base,
      canAccess: () => craftUse(base.user()).permissions.includes(permission),
    })),
  });

const Card = craftComponent(
  'Card',
  { providers: [provideUserPanelView()] },
  function* (inputs: { readonly user: Input<User> }) {
    const { user } = yield* UserPanelView(inputs);
    return div(user.name);
  },
).pipe(hasPermission('edit'));
```

`edit` is internal configuration. The caller of `Card` does not provide it.

## Input supplied by the component caller

A template transform reads the inputs it needs, and those inputs become inputs
of the composed component:

```ts
const hasPermissionInput = craftDirective('hasPermissionInput', {}, {
  template:
    (baseTemplate) =>
    (inputs: {
      readonly user: Input<User>;
      readonly permission: Input<Permission>;
    }) =>
      craftUse(inputs.user()).permissions.includes(
        craftUse(inputs.permission()),
      )
        ? baseTemplate(inputs)
        : [],
});

const Card = craftComponent(
  'Card',
  {},
  ({ user }: { readonly user: Input<User> }) => div(user.name),
).pipe(hasPermissionInput);

Card({
  user: () => currentUser,
  permission: () => 'edit',
});
```

The directive adds `permission` to `Card`'s public props. A service transform
never does: it may enrich or restrict what the template reads, but the public
surface of a component stays what its own parameter declares.

## Structural directive

A structural directive decides whether the template produces nodes:

<<< @/tests/snippets/guide/components/directives/whendirective.spec.ts#whendirective

When `when()` becomes false, the renderer removes the template output. When it
becomes true again, the template is rendered again.

A structural directive can consume what a previous directive added:

```ts
const onlyEditable = craftDirective('onlyEditable', {}, {
  template: (baseTemplate) => (inputs) =>
    craftUse(UserPanelView().canEdit()) ? baseTemplate(inputs) : [],
});

const EditableCard = craftComponent(
  'EditableCard',
  { providers: [provideUserPanelView()] },
  function* (inputs: { readonly user: Input<User> }) {
    const { user } = yield* UserPanelView(inputs);
    return div(user.name);
  },
).pipe(InteractivePermissions, onlyEditable);
```

Transformations apply from left to right:

```text
the component's own service
  → InteractivePermissions  (adds `canEdit`)
  → onlyEditable            (reads it, renders or not)
```

## Directives on nodes

A component can also apply a directive to a hyperscript node. The transform is
then installed in a child scope limited to that subtree — the rest of the
component keeps the service it had:

```ts
const message = p('Message').pipe(whenDirective);
```

Craft directives can therefore transform part of a template without introducing
an intermediate component.

Functional DOM directives can also receive their configuration directly and be
applied with `.pipe(...)`. The configuration is owned by the directive instead
of becoming a DOM attribute:

```ts
a({}, 'Tasks').pipe(CraftRouterLink(link));
```

A field configured with `insertSelectFormTree` must be selected before it is
bound, so its lazy insertions (including validators) are registered:

```ts
input({ type: 'email' }).pipe(
  CraftFieldDirective(loginForm.form.selectEmail()),
);
```

## Composition rules

- Create a configurable directive with `craftDirective(...)`, then pass it to
  `.pipe(...)`.
- A **template** transform can add public inputs; they appear in the final
  component props. A **service** transform cannot: it changes what the template
  reads, never what the caller passes.
- `.pipe(...)` on a component installs the transformation in the component's
  scope; `.pipe(...)` on a node limits it to that subtree.
- A directive placed after another sees the already transformed service and
  template, so it can consume what the previous one added.
- `withProviders(...)` and the exception handlers travel through the same
  `.pipe(...)`, as environment operators rather than service transforms.
- Generator functions continue to be executed by the Craft runtime.
  Dependencies from the component and from its directives remain part of the
  component dependency contract.

## See Also

- [Customization](/guide/components/customization)
- [Encapsulated styles](/guide/components/styles)
- [Testing components](/guide/testing/components)
