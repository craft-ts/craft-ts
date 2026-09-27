// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region toolbaraction
import {
  button,
  craftComponent,
  projection,
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

// The contract a parent may read is declared in the meta; the component's own
// function stays what it always is — inputs in, nodes out.
const ToolbarAction = craftComponent(
  'ToolbarAction',
  { projection: projection<ToolbarActionContract>() },
  function* (input: {
    readonly key: string;
    readonly content: ContentSlot;
    readonly trigger: () => void;
    readonly disabled?: () => boolean;
  }) {
    return button(
      'action',
      {
        type: 'button',
        disabled: input.disabled ?? (() => false),
        click: input.trigger,
      },
      renderContent(input.content),
    );
  },
);

type ExtractedContract = ProjectionContractOf<typeof ToolbarAction>;
type ToolbarActionUnit = ProjectionOf<typeof ToolbarAction>;
// #endregion toolbaraction

describe('guide/components/content-projection.md #toolbaraction', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
