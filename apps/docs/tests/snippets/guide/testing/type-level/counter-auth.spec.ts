// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region counter-auth
import { state } from '@craft-ng/core';
import {
  button,
  craftComponent,
  div,
  ifBlock,
  span,
} from '@craft-ng/component';

const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const isAuth = yield* state('isAuth', true);
    const brandedStatus = yield* state('brandedStatus', 'ready');
    return { isAuth, brandedStatus };
  },
  ({ isAuth, brandedStatus }) =>
    ifBlock(
      isAuth,
      () =>
        div([
          button('increment', { type: 'button', click: function* () {} }, '+'),
          span(brandedStatus),
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
