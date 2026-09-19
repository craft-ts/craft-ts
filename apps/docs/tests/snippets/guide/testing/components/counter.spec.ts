// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region counter
import { setupCraftComponentTemplateTest } from '@craft-ts/component';

import {
  craftComputed,
  craftService,
  craftUse,
  setupCraftServiceTestingByRegister,
  state,
} from '@craft-ts/core';
import { craftComponent, button } from '@craft-ts/component';
import type {
  ComponentTemplateOf,
  TemplateChildren,
  TemplateRendersStateWhen,
} from '@craft-ts/component';
import type { Equal, Expect } from 'test-type';

const { CounterView, provideCounterView } = craftService(
  { name: 'counterView', providedIn: 'toProvide' },
  function* () {
    const counter = yield* state('counter', 0, ({ state, update }) => ({
      disabled: craftComputed('disabled', function* () {
        return (yield* state()) % 2 === 0;
      }),
      increment: () => update((value) => value + 1),
    }));

    return { counter };
  },
);

const Counter = craftComponent(
  'Counter',
  { providers: [provideCounterView()] },
  function* () {
    const { counter } = yield* CounterView();

    return button(
      'increment',
      {
        type: 'button',
        disabled: counter.disabled,
        click: counter.increment,
      },
      '+',
    );
  },
);

// The service is where the state lives, so that is where the derivation is
// tested — no DOM involved.
it('tests the derived disabled state', async () => {
  const { sut } = await setupCraftServiceTestingByRegister(CounterView, {
    counterView: provideCounterView(),
  } as never);

  expect(craftUse(sut.counter.disabled())).toBe(true);

  craftUse(sut.counter.increment());

  expect(craftUse(sut.counter())).toBe(1);
  expect(craftUse(sut.counter.disabled())).toBe(false);
});

// The template is tested against that service, real or mocked.
it('renders the button the service disables', async () => {
  const template = await setupCraftComponentTemplateTest(Counter, {
    inputs: {},
    register: { counterView: provideCounterView() },
  });

  try {
    expect(
      template.getByRole('button', { name: '+' }).hasAttribute('disabled'),
    ).toBe(true);
  } finally {
    template.destroy();
  }
});

type _DisabledBindingIsCorrect = Expect<
  Equal<
    TemplateRendersStateWhen<
      TemplateChildren<ComponentTemplateOf<typeof Counter>>,
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
