// @vitest-environment jsdom
import { TestBed } from '@craft-ng/core';
import { setupCraftComponentLogicTest } from '@craft-ng/component';
import { craftUse } from '@craft-ng/core';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// #region user-card
import {
  Input,
  Output,
  button,
  craftComponent,
  div,
  span,
} from '@craft-ng/component';
import { deepYieldable } from '@craft-ng/core';

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
// #endregion user-card

beforeAll(() => {
});

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('Learn 01 UserCard snippet', () => {
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
