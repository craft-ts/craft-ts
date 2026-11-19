// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region counter-auth
import { craftService, state } from '@craft-ts/core';
import { button, craftComponent, div, ifNode, span } from '@craft-ts/component';

const { CounterView, provideCounterView } = craftService(
  { name: 'counterView', providedIn: 'toProvide' },
  function* () {
    yield* state('isAuth', true);
    yield* state('brandedStatus', 'ready');
  },
);

const Counter = craftComponent(
  'Counter',
  { providers: [provideCounterView()] },
  () =>
    ifNode(
      'counter-authenticated',
      function* () {
        return yield* (yield* CounterView()).isAuth();
      },
      () =>
        div([
          button('increment', { type: 'button', click: function* () {} }, '+'),
          span(function* () {
            return yield* (yield* CounterView()).brandedStatus();
          }),
        ]),
      () => [],
    ),
);
// #endregion counter-auth

describe('guide/testing/type-level.md #counter-auth', () => {
  it('loads the documented snippet', () => {
    expect(Counter).toEqual(expect.any(Function));
  });
});
