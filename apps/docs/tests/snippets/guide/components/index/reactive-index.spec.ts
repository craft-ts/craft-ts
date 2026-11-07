// @vitest-environment jsdom
import { expect, it } from 'vitest';
// The snippet drives the list from outside, as a store would.
// eslint-disable-next-line craft-ts/no-direct-craft-reactivity
import { craftSignal } from '@craft-ts/core';
import { setupCraftComponentTemplateTest } from '@craft-ts/component';

// #region reactive-index
import { craftComponent, forNode, p } from '@craft-ts/component';

const users = craftSignal([
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Lin' },
]);
const NumberedList = craftComponent('NumberedList', {}, () =>
  forNode(users, { track: (user) => user.id }, (user, index) =>
    p(function* () {
      return `${(yield* index()) + 1}. ${(yield* user()).name}`;
    }),
  ),
);
// #endregion reactive-index


it('updates positions and preserves keyed DOM when the users move', async () => {
  const template = await setupCraftComponentTemplateTest(NumberedList, {
    inputs: {},
    register: {},
  });
  try {
    const rows = [...template.nativeElement.querySelectorAll('p')];
    expect(rows.map((row) => row.textContent)).toEqual(['1. Ada', '2. Lin']);
    users.update((value) => [...value].reverse());
    expect([...template.nativeElement.querySelectorAll('p')]).toEqual(
      [...rows].reverse(),
    );
    expect(template.nativeElement.textContent).toBe('1. Lin2. Ada');
  } finally {
    template.destroy();
  }
});
