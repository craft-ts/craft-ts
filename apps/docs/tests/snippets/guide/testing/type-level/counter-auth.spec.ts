// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region counter-auth
import { state } from '@craft-ts/core';
import {
  button,
  craftComponent,
  div,
  ifNode,
  span,
} from '@craft-ts/component';

const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const isAuth = yield* state('isAuth', true);
    const brandedStatus = yield* state('brandedStatus', 'ready');
    return { isAuth, brandedStatus };
  },
  ({ isAuth, brandedStatus }) =>
    ifNode(
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
