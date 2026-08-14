# @craft-ng/component

Functional, selectorless Angular components rendered from typed hyperscript
descriptors.

## Installation

```bash
npm install @craft-ng/core@beta @craft-ng/component@beta
```

```ts
import {
  button,
  craftComponent,
  div,
  each,
  p,
  type Input,
  type Output,
} from '@craft-ng/component';

const userCard = craftComponent(
  'userCard',
  {},
  (user: Input<User>, onPick: Output<(user: User) => void>) => ({
    user,
    onPick,
  }),
  ({ user, onPick }) => button({ click: () => onPick(user()) }, user().name),
);

export const userList = craftComponent(
  'userList',
  {},
  (users: Input<User[]>) => ({ users }),
  ({ users }) =>
    div(
      each(
        users,
        {
          track: (user) => user.id,
          empty: () => p('Aucun utilisateur'),
        },
        (user) =>
          userCard({
            user: () => user,
            onPick: console.log,
          }),
      ),
    ),
);
```

The renderer separates structural effects from binding effects. Explicit text,
attribute, property, class, and style callbacks update only their existing DOM
node; `ifBlock`, `each`, projections, and templates own their structural
effects. DOM is patched through Angular's public `Renderer2` API, without Ivy
instructions or private Angular APIs.

Prefer explicit callbacks for values that should update granularly:

```ts
p(() => `Count: ${count()}`);
button({ disabled: () => isDisabled() }, 'Save');
div({ class: () => ({ active: isActive() }) });
div({ style: () => ({ color: color() }) });
```

A value calculated before the VNode is created remains supported, but its
signal is a dependency of the surrounding structural template instead:

```ts
p(`Count: ${count()}`);
```

Render callbacks must be pure: read signals and calculate a value, but do not
call `set`, `update`, or `mutate`. Writes belong in DOM events, outputs,
mutations, or explicit business effects. The optional
`craft-ng/no-render-writes` ESLint rule detects the common invalid patterns.

`Input<T>` values are yieldable reactive readers. `Output<T>` values are
yieldable callbacks.
Call-site props are inferred from branded values returned in the factory
context. Because TypeScript does not expose function parameter names at
runtime, positional factory arguments follow the key order of the props object;
keep that order aligned with the factory parameters.

Mount a root component imperatively with `mountCraftComponent`, or use the
standalone `[craftComponentHost]` bridge directive from an Angular template.
