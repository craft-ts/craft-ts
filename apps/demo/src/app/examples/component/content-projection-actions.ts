import { craftService, craftExpose, type CraftServiceInput } from '@craft-ts/core';
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
import { componentUi, projectionDemo } from './component-demos.style';

export const { UserBadgeView, provideUserBadgeView } = craftService(
  { name: 'userBadgeView', providedIn: 'toProvide' },
  function* (inputs: { readonly role: CraftServiceInput<string> }) {
    const { role } = inputs;
    yield* craftExpose('role', role);
  },
);

export const userBadge = craftComponent(
  'userBadge',
  { providers: [provideUserBadgeView()] },
  function* (inputs: { readonly role: Input<string> }) {
    const { role } = yield* UserBadgeView(inputs);
    return span({ class: projectionDemo.badge }, role);
  },
);

type ToolbarActionContract = {
  readonly kind: 'toolbar-action';
  readonly trigger: () => void;
  readonly disabled: () => boolean;
};

export const { ToolbarActionView, provideToolbarActionView } = craftService(
  { name: 'toolbarActionView', providedIn: 'toProvide' },
  function* (input: {
    readonly key: string;
    readonly content: ContentSlot;
    readonly trigger: () => void;
    readonly disabled?: () => boolean;
  }) {
    yield* craftExpose('key', input.key);
    yield* craftExpose('contract', {
      kind: 'toolbar-action',
      trigger: input.trigger,
      disabled: input.disabled ?? (() => false),
    } satisfies ToolbarActionContract);
    yield* craftExpose('content', input.content);
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
        class: componentUi.button,
        'data-componentButton': 'primary',
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
