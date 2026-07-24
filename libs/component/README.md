# @craft-ng/component

Functional, selectorless Angular components rendered from typed hyperscript
descriptors.

```ts
import {
  button,
  component,
  div,
  each,
  p,
  type Input,
  type Output,
} from '@craft-ng/component';

const userCard = component(
  {},
  (
    user: Input<User>,
    onPick: Output<(user: User) => void>,
  ) => ({ user, onPick }),
  ({ user, onPick }) =>
    button({ click: () => onPick(user()) }, user().name),
);

export const userList = component(
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

The milestone-one renderer re-runs the template in a `craftEffect`, diffs its
descriptor tree and patches through Angular's public `Renderer2` API. It emits
no Ivy instructions and imports no private Angular API.

`Input<T>` values are reactive accessors. `Output<T>` values are callbacks.
Call-site props are inferred from branded values returned in the factory
context. Because TypeScript does not expose function parameter names at
runtime, positional factory arguments follow the key order of the props object;
keep that order aligned with the factory parameters.

Mount a root component imperatively with `mountCraftComponent`, or use the
standalone `[craftComponentHost]` bridge directive from an Angular template.
