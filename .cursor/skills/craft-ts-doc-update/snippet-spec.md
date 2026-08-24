# Snippet spec template

Harness helper: `apps/docs/tests/snippets/snippet-harness.ts` (`useSnippetHarness`).
Snippet tests use the Craft testing harness from `apps/docs/tests/snippets/snippet-harness.ts`.

Relative import to the harness: one `../` per directory under `tests/snippets/` (not counting the file name).

- `tests/snippets/learn/01-first-state/tasks-component.spec.ts` → `../../snippet-harness`
- `tests/snippets/guide/app/expose-api/current-user.spec.ts` → `../../../snippet-harness`

## Component (logic test)

```ts
// @vitest-environment jsdom
import { TestBed } from '@craft-ts/core';
import { setupCraftComponentLogicTest } from '@craft-ts/component';
import { craftUse } from '@craft-ts/core';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// #region usercard
import {
  Input,
  Output,
  button,
  craftComponent,
  div,
  span,
} from '@craft-ts/component';
import { deepYieldable } from '@craft-ts/core';

type User = { name: string };

const UserCard = craftComponent(
  'UserCard',
  {},
  (user: Input<User>, onRemove: Output<(user: User) => void>) => ({
    user: deepYieldable(user),
    onRemove,
  }),
  ({ user, onRemove }) =>
    div([
      span(user.name),
      button({
        type: 'button',
        *click() {
          yield* onRemove(yield* user());
        },
      }, 'Remove'),
    ]),
);
// #endregion usercard

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('guide/components/index.md #usercard', () => {
  it('projects the user input through deepYieldable', async () => {
    const { context, destroy } = await setupCraftComponentLogicTest(UserCard, {
      args: [
        function* () {
          return { name: 'Ada' };
        },
        (_user: User) => undefined,
      ],
      register: {},
    });

    try {
      expect(craftUse(context.user.name())).toBe('Ada');
    } finally {
      destroy();
    }
  });
});
```

`useSnippetHarness()` is enough instead of the `beforeAll` / `beforeEach` pair when the test does not need extra TestBed config.

## Service (register test)

```ts
// @vitest-environment jsdom
import {
  craftUse,
  setupCraftServiceTestingByRegister,
} from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region current-user
import { craftService, state } from '@craft-ts/core';

const { UsersApi } = craftService(
  { name: 'UsersApi', scope: 'global' },
  function* () {
    const currentUser = yield* state('currentUser', {
      id: '1',
      name: 'Ada',
    });
    return { currentUser };
  },
);

const { CurrentUser } = craftService(
  { name: 'CurrentUser', scope: 'global' },
  function* () {
    return yield* UsersApi.currentUser();
  },
);
// #endregion current-user

describe('guide/app/expose-api.md #current-user', () => {
  it('tracks only the currentUser property shortcut', async () => {
    const { sut } = await setupCraftServiceTestingByRegister(CurrentUser, {
      CurrentUser: 'real',
      UsersApi: 'real',
    });

    expect(craftUse(sut())).toEqual({ id: '1', name: 'Ada' });
  });
});
```

Host services used only by the test (e.g. `CounterHost` that yields `Counter.count(...)`) stay **outside** the region so VitePress does not show them.

## Markdown

```markdown
<<< @/tests/snippets/guide/app/expose-api/current-user.spec.ts#current-user
```

Do not wrap `<<<` in a ` ``` ` fence. A blank line after the import is fine.

## Pitfalls

- `#endregion` without the region name → VitePress prints the harness.
- Two fences on one page both named `counter` → the second spec overwrites the first; Markdown then shows the wrong example. Use `counter-nested` / `counter-auth`.
- Putting `it()` / `useSnippetHarness` inside the region → it appears on the site.
- Extracting a `signal()` example to silence the update → lint fails (`prefer-craft-state`). Rewrite to `state()` first.
- `state('x', null as SomeObject | null)` → runtime proxy error. Use a real object seed, or `null as string | null` for primitives.
