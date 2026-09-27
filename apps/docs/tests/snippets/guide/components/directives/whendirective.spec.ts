// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region whendirective
import {
  Input,
  craftComponent,
  craftDirective,
  div,
  p,
} from '@craft-ts/component';
import { craftSignal, craftUse } from '@craft-ts/core';

const isVisible = craftSignal(true);

// A directive declares transformations. `template` wraps the template the
// component already has; the inputs it reads become inputs of the component.
const whenDirective = craftDirective(
  'whenDirective',
  {},
  {
    template:
      (baseTemplate) => (inputs: { readonly when: Input<boolean> }) =>
        craftUse(inputs.when()) ? baseTemplate(inputs) : [],
  },
);

const Panel = craftComponent('Panel', {}, () =>
  div(p('Conditional content')),
).pipe(whenDirective);

Panel({
  when: function* () {
    return isVisible();
  },
});
// #endregion whendirective

describe('guide/components/directives.md #whendirective', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
