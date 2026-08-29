import {
  button,
  craftComponent,
  renderContent,
  span,
  type ContentSlot,
  type Input,
  type ProjectionContractOf,
  type ProjectionSlot,
} from '@craft-ts/component';

export const userBadge = craftComponent(
  'userBadge',
  {},
  (role: Input<string>) => ({ role }),
  ({ role }) => span({ class: 'projection-demo__badge' }, role),
);

type ToolbarActionContract = {
  readonly kind: 'toolbar-action';
  readonly trigger: () => void;
  readonly disabled: () => boolean;
};

export const toolbarAction = craftComponent(
  'toolbarAction',
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
  ({ contract, content: label }) =>
    button(
      'action',
      {
        class: 'projection-demo__action',
        type: 'button',
        disabled: contract.disabled,
        click: contract.trigger,
      },
      renderContent(label),
    ),
);

type ToolbarActionContractFromComponent = ProjectionContractOf<
  typeof toolbarAction
>;
export type ToolbarActionSlot =
  ProjectionSlot<ToolbarActionContractFromComponent>;
