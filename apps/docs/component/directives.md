# Functional directives and `.pipe(...)`

This page describes how to compose Craft functional components with
`craftDirective`.

A directive decorates both the component logic factory and its template.
Directives are applied from left to right.

```ts
import {
  button,
  component,
  craftDirective,
  div,
  p,
  type HostRequiredLogic,
  type HostTemplate,
  type Input,
} from '@craft-ng/component';
```

## `InteractivePermissions`

The examples below use a directive that adds a `permissions` object to the
component context. Its configuration is internal to the directive; the
component caller only provides the original `user` input.

```ts
type RequiresUser = {
  user: Input<User>;
};

type ProvidesPermissions = RequiresUser & {
  permissions: {
    canEdit: () => boolean;
  };
};

const InteractivePermissions = craftDirective(
  (baseLogic: HostRequiredLogic<RequiresUser>) => (user: Input<User>) => {
    const context = baseLogic(user);

    return {
      ...context,
      permissions: {
        canEdit: () => user().permissions.includes('edit'),
      },
    };
  },

  (baseTemplate: HostTemplate<ProvidesPermissions>) => (context) =>
    baseTemplate(context),
);
```

## Basic composition

A directive transforms the existing logic and template:

```ts
const Card = component(
  {},
  (user: Input<User>) => ({ user }),
  ({ user }) => div(user().name),
).pipe(InteractivePermissions);
```

The result of `InteractivePermissions` becomes the logic actually executed by
`Card`:

```text
component inputs
        ↓
original logic
        ↓
logic added by the directive
        ↓
final context
        ↓
final template
```

## Directive configuration input

A fixed configuration can be supplied when the directive is created:

```ts
const hasPermission = (permission: Permission) =>
  craftDirective(
    (baseLogic: HostRequiredLogic<RequiresUser>) => (user: Input<User>) => {
      const context = baseLogic(user);

      return {
        ...context,
        permissions: {
          canAccess: () => user().permissions.includes(permission),
        },
      };
    },

    (baseTemplate: HostTemplate<ProvidesPermissions>) => (context) =>
      context.permissions.canAccess() ? baseTemplate(context) : [],
  );

const Card = component(
  {},
  (user: Input<User>) => ({ user }),
  ({ user }) => div(user().name),
).pipe(hasPermission('edit'));
```

`edit` is internal configuration. The caller of `Card` does not provide it.

## Input supplied by the component caller

A directive can also add a public input to the component:

```ts
const hasPermissionInput = craftDirective(
  (baseLogic: HostRequiredLogic<RequiresUser>) =>
    (user: Input<User>, permission: Input<Permission>) => {
      const context = baseLogic(user);

      return {
        ...context,
        permission,
        permissions: {
          canAccess: () => user().permissions.includes(permission()),
        },
      };
    },

  (
    baseTemplate: HostTemplate<{
      user: Input<User>;
      permission: Input<Permission>;
      permissions: {
        canAccess: () => boolean;
      };
    }>,
  ) =>
    (context) => (context.permissions.canAccess() ? baseTemplate(context) : []),
);

const Card = component(
  {},
  (user: Input<User>) => ({ user }),
  ({ user }) => div(user().name),
).pipe(hasPermissionInput);

Card({
  user: () => currentUser,
  permission: () => 'edit',
});
```

The directive adds `permission` to the final logic and to `Card`'s public
props. The renderer passes factory arguments in prop order, following the
existing convention for functional component factories.

## Structural directive

A structural directive decides whether the template produces nodes:

```ts
const whenDirective = craftDirective(
  (
    baseLogic: HostRequiredLogic<{
      when: Input<boolean>;
    }>,
  ) => baseLogic,

  (
    baseTemplate: HostTemplate<{
      when: Input<boolean>;
    }>,
  ) =>
    (context) => (context.when() ? baseTemplate(context) : []),
);

const Panel = component(
  {},
  (when: Input<boolean>) => ({ when }),
  () => div(p('Conditional content')),
).pipe(whenDirective);

Panel({
  when: () => isVisible(),
});
```

When `when()` becomes false, the renderer removes the template output. When it
becomes true again, the template is rendered again.

A structural directive can consume context added by a previous directive:

```ts
const onlyEditable = craftDirective(
  (
    baseLogic: HostRequiredLogic<{
      permissions: {
        canEdit: () => boolean;
      };
    }>,
  ) => baseLogic,

  (
    baseTemplate: HostTemplate<{
      permissions: {
        canEdit: () => boolean;
      };
    }>,
  ) =>
    (context) => (context.permissions.canEdit() ? baseTemplate(context) : []),
);

const EditableCard = component(
  {},
  (user: Input<User>) => ({ user }),
  ({ user }) => div(user().name),
).pipe(InteractivePermissions, onlyEditable);
```

The context flows from left to right:

```text
original logic
  → InteractivePermissions
  → { user, permissions }
  → onlyEditable
  → template or []
```

## Directives on elements

A component template can also apply a structural directive to a hyperscript
node:

```ts
const message = p('Message').pipe(whenDirective);
```

The component context is passed to the decorated template. Craft structural
directives can therefore transform Craft output without introducing an
intermediate component.

Angular host directives can also be applied with `.pipe(...)`, without placing
a `directives` property in the props:

```ts
button({ craftRouterLink: link }).pipe(CraftRouterLink);
```

## Composition rules

- Create a configurable directive with `craftDirective(...)`, then pass it to
  `.pipe(...)`.
- A directive can add public inputs; they appear in the final component props.
- A directive placed after another receives the already decorated logic and
  template, so it can consume context added by the previous directive.
- Generator factories continue to be executed by the Craft runtime. Dependencies
  from both the original and decorated factories remain part of the component
  dependency contract.
