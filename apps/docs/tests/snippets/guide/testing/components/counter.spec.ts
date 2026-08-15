// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region counter
import { setupCraftComponentLogicTest } from '@craft-ng/component';

import { craftComputed, craftUse, state } from '@craft-ng/core';
import { craftComponent, button } from '@craft-ng/component';
import type {
  ComponentTemplateOf,
  TemplateRendersStateWhen,
} from '@craft-ng/component';
import type { Equal, Expect } from 'test-type';

const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const counter = yield* state('counter', 0, ({ state, update }) => ({
      disabled: craftComputed(function* () {
        return (yield* state()) % 2 === 0;
      }),
      increment: () => update((value) => value + 1),
    }));

    return { counter };
  },
  ({ counter }) =>
    button('increment',
      { type: 'button',
        disabled: counter.disabled,
        *click() {
          yield* counter.increment();
        },
      },
      '+',
    ),
);

it('tests the derived disabled state', async () => {
  const { context, destroy } = await setupCraftComponentLogicTest.byRegister(
    Counter,
    {
      register: {},
    },
  );

  try {
    expect(craftUse(context.counter.disabled())).toBe(true);

    craftUse(context.counter.increment());

    expect(craftUse(context.counter())).toBe(1);
    expect(craftUse(context.counter.disabled())).toBe(false);
  } finally {
    destroy();
  }
});

type _DisabledBindingIsCorrect = Expect<
  Equal<
    TemplateRendersStateWhen<
      ReturnType<ComponentTemplateOf<typeof Counter>>,
      'counter.disabled'
    >,
    true
  >
>;
// #endregion counter

describe('guide/testing/components.md #counter', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
