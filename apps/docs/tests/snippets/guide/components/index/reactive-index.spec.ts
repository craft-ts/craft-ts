// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { craftSignal } from '@craft-ts/core';
import { setupCraftComponentTemplateTest } from '@craft-ts/component';

// #region reactive-index
import { craftComponent, forNode, p, type Input } from '@craft-ts/component';

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

// #region reactive-index-input
const Position = craftComponent(
  'Position',
  {},
  (inputs: { position: Input<number> }) =>
    p(function* () {
      return `Position ${(yield* inputs.position()) + 1}`;
    }),
);
const Positions = craftComponent('Positions', {}, () =>
  forNode(users, { track: (user) => user.id }, (_user, index) =>
    Position({ position: index }),
  ),
);
// #endregion reactive-index-input

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

it('forwards the index reader to a reactive child input', async () => {
  const template = await setupCraftComponentTemplateTest(Positions, {
    inputs: {},
    register: {},
  });
  try {
    expect(template.nativeElement.textContent).toBe('Position 1Position 2');
    users.update((value) => [...value].reverse());
    expect(template.nativeElement.textContent).toBe('Position 1Position 2');
  } finally {
    template.destroy();
  }
});
