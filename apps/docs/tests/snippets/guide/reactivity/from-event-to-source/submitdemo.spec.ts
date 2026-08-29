// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region submitdemo
import { button, craftComponent, form, input, p } from '@craft-ts/component';
import { craftComputed, fromEventToSource$, on$, state } from '@craft-ts/core';

export const SubmitDemo = craftComponent(
  'SubmitDemo',
  {},
  function* () {
    const submit$ = fromEventToSource$(document, 'submit', {
      computedValue: (event: Event) => {
        event.preventDefault();
        const formData = new FormData(event.target as HTMLFormElement);
        return Object.fromEntries(formData);
      },
    });

    const formData = yield* state(
      'formData',
      null as Record<string, unknown> | null,
      ({ state, set }) => ({
        // bound to the source, so NOT exposed on the ref
        handleSubmit: on$(submit$, (data) => set(data)),
        formDataJson: craftComputed('formDataJson', function* () {
          return JSON.stringify(yield* state());
        }),
      }),
    );

    return { formData };
  },
  ({ formData }) =>
    form([
      input('username', { type: 'text', name: 'username' }),
      button('submit', { type: 'submit' }, 'Submit'),
      p(formData.formDataJson),
    ]),
);
// #endregion submitdemo

describe('guide/reactivity/from-event-to-source.md #submitdemo', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
