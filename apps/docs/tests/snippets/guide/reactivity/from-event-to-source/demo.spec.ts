// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region demo
import { craftComponent, p } from '@craft-ng/component';

export const Demo = craftComponent(
  'Demo',
  {},
  function* () {
    const keydown$ = fromEventToSource$<KeyboardEvent>(document, 'keydown');

    // the listener is removed automatically when the component is destroyed
    return { keydown$ };
  },
  () => p('Press any key'),
);
// #endregion demo

describe('guide/reactivity/from-event-to-source.md #demo', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
