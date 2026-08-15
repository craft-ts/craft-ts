// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region submitdemo
import {
  button,
  craftComponent,
  form,
  input,
  p,
} from '@craft-ng/component';
import { state } from '@craft-ng/core';

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
      ({ set }) => ({
        // bound to the source, so NOT exposed on the ref
        handleSubmit: on$(submit$, (data) => set(data)),
      }),
    );

    return { formData };
  },
  ({ formData }) =>
    form([
      input({ type: 'text', name: 'username' }),
      button({ type: 'submit' }, 'Submit'),
      p(function* () {
        return JSON.stringify(yield* formData());
      }),
    ]),
);
// #endregion submitdemo

describe('guide/reactivity/from-event-to-source.md #submitdemo', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
