// @vitest-environment jsdom
import { TestBed } from '@craft-ts/core';
import { setupCraftComponentTemplateTest } from '@craft-ts/component';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  function* (inputs: {
    readonly user: Input<User>;
    readonly onRemove: Output<(user: User) => void>;
  }) {
    const user = deepYieldable(inputs.user);
    const { onRemove } = inputs;

    return div([
      span(user.name),
      button(
        'remove',
        {
          type: 'button',
          *click() {
            onRemove(yield* user());
          },
        },
        'Remove',
      ),
    ]);
  },
);
// #endregion usercard

beforeAll(() => {});

beforeEach(() => {
  TestBed.resetTestingModule();
});

describe('guide/components/index.md #usercard', () => {
  it('reads the user input and hands it back to the output', async () => {
    const onRemove = vi.fn();
    const template = await setupCraftComponentTemplateTest(UserCard, {
      inputs: {
        user: function* () {
          return { name: 'Ada' };
        },
        onRemove,
      },
      register: {},
    });

    try {
      expect(template.nativeElement.textContent).toContain('Ada');
      template.getByRole('button', { name: 'Remove' }).click();
      expect(onRemove).toHaveBeenCalledWith({ name: 'Ada' });
    } finally {
      template.destroy();
    }
  });
});
