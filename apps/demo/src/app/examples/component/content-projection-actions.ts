import { craftService } from '@craft-ts/core';
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

export const { UserBadgeView, provideUserBadgeView } = craftService(
  { name: 'userBadgeView', providedIn: 'toProvide' },
  (inputs: { readonly role: Input<string> }) => {
    const { role } = inputs;
    return { role };
  },
);

export const userBadge = craftComponent(
  'userBadge',
  { providers: [provideUserBadgeView()] },
  function* (inputs: { readonly role: Input<string> }) {
    const { role } = yield* UserBadgeView(inputs);
    return span({ class: 'projection-demo__badge' }, role);
  },
);

type ToolbarActionContract = {
  readonly kind: 'toolbar-action';
  readonly trigger: () => void;
  readonly disabled: () => boolean;
};

export const { ToolbarActionView, provideToolbarActionView } = craftService(
  { name: 'toolbarActionView', providedIn: 'toProvide' },
  (input: {
    readonly key: string;
    readonly content: ContentSlot;
    readonly trigger: () => void;
    readonly disabled?: () => boolean;
  }) => {
    return {
      key: input.key,
      contract: {
        kind: 'toolbar-action',
        trigger: input.trigger,
        disabled: input.disabled ?? (() => false),
      } satisfies ToolbarActionContract,
      content: input.content,
    };
  },
);

export const toolbarAction = craftComponent(
  'toolbarAction',
  { providers: [provideToolbarActionView()] },
  function* (input: {
    readonly key: string;
    readonly content: ContentSlot;
    readonly trigger: () => void;
    readonly disabled?: () => boolean;
  }) {
    const { contract, content: label } = yield* ToolbarActionView(input);
    return button(
      'action',
      {
        class: 'projection-demo__action',
        type: 'button',
        disabled: contract.disabled,
        click: contract.trigger,
      },
      renderContent(label),
    );
  },
);

type ToolbarActionContractFromComponent = ProjectionContractOf<
  typeof toolbarAction
>;
export type ToolbarActionSlot =
  ProjectionSlot<ToolbarActionContractFromComponent>;
