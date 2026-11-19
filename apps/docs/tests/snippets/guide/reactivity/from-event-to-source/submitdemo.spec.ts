// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region submitdemo
import { button, craftComponent, form, input, p } from '@craft-ts/component';
import {
  craftComputed,
  craftService,
  craftUse,
  fromEventToSource$,
  on$,
  state,
} from '@craft-ts/core';

const { SubmitDemoView, provideSubmitDemoView } = craftService(
  { name: 'submitDemoView', providedIn: 'toProvide' },
  function* () {
    const submit$ = fromEventToSource$(document, 'submit', {
      computedValue: (event: Event) => {
        event.preventDefault();
        const submitted = new FormData(event.target as HTMLFormElement);
        return Object.fromEntries(submitted);
      },
    });

    yield* state(
      'formData',
      null as Record<string, unknown> | null,
      ({ state, set }) => ({
        // bound to the source, so NOT exposed on the ref
        handleSubmit: on$(submit$, (data) => set(data)),
        formDataJson: craftUse(
          craftComputed('formDataJson', function* () {
            return JSON.stringify(yield* state());
          }),
        ),
      }),
    );
  },
);

export const SubmitDemo = craftComponent(
  'SubmitDemo',
  { providers: [provideSubmitDemoView()] },
  () =>
    form([
      input('username', { type: 'text', name: 'username' }),
      button('submit', { type: 'submit' }, 'Submit'),
      p(function* () {
        return yield* (yield* SubmitDemoView()).formData.formDataJson();
      }),
    ]),
);
// #endregion submitdemo

describe('guide/reactivity/from-event-to-source.md #submitdemo', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
