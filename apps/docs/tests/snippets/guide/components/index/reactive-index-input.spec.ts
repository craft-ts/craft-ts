// @vitest-environment jsdom
import { expect, it } from 'vitest';
// The snippet drives the list from outside, as a store would.
// eslint-disable-next-line craft-ts/no-direct-craft-reactivity
import { craftSignal } from '@craft-ts/core';
import {
  craftComponent,
  forNode,
  p,
  setupCraftComponentTemplateTest,
  type Input,
} from '@craft-ts/component';

const users = craftSignal([
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Lin' },
]);

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
