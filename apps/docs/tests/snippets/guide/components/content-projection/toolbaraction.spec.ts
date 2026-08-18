// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region toolbaraction
import { content, input } from '@craft-ts/component';

import {
  button,
  craftComponent,
  renderContent,
  type ContentSlot,
  type ProjectionContractOf,
  type ProjectionOf,
} from '@craft-ts/component';

type ToolbarActionContract = {
  readonly kind: 'toolbar-action';
  readonly trigger: () => void;
  readonly disabled: () => boolean;
};

const ToolbarAction = craftComponent(
  'ToolbarAction',
  {},
  (input: {
    readonly key: string;
    readonly content: ContentSlot;
    readonly trigger: () => void;
    readonly disabled?: () => boolean;
  }) => ({
    key: input.key,
    contract: {
      kind: 'toolbar-action',
      trigger: input.trigger,
      disabled: input.disabled ?? (() => false),
    } satisfies ToolbarActionContract,
    content: input.content,
  }),
  ({ contract, content }) =>
    button('action',
      {
        type: 'button',
        disabled: contract.disabled,
        click: contract.trigger,
      },
      renderContent(content),
    ),
);

type ExtractedContract = ProjectionContractOf<typeof ToolbarAction>;
type ToolbarActionUnit = ProjectionOf<typeof ToolbarAction>;
// #endregion toolbaraction

describe('guide/components/content-projection.md #toolbaraction', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
