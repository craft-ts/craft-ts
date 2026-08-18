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
      button('remove', {
        type: 'button',
        *click() {
          yield* onRemove(yield* user());
        },
      }, 'Remove'),
    ]),
);
// #endregion usercard

beforeAll(() => {
});

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
