// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region whendirective
import {
  HostRequiredLogic,
  HostTemplate,
  Input,
  craftComponent,
  craftDirective,
  div,
  p,
} from '@craft-ts/component';
import { craftSignal } from '@craft-ts/core';

const isVisible = craftSignal(true);

const whenDirective = craftDirective(
  'whenDirective',
  {},
  (
    baseLogic: HostRequiredLogic<{
      when: Input<boolean>;
    }>,
  ) => baseLogic,

  (
    baseTemplate: HostTemplate<{
      when: Input<boolean>;
    }>,
  ) =>
    (context) => (context.when() ? baseTemplate(context) : []),
);

const Panel = craftComponent(
  'Panel',
  {},
  (when: Input<boolean>) => ({ when }),
  () => div(p('Conditional content')),
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
