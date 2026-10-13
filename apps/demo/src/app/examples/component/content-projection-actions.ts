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

export const userBadge = craftComponent(
  'userBadge',
  {},
  (inputs: { readonly role: Input<string> }) =>
    span({ class: projectionDemo.badge }, inputs.role),
);

export const toolbarAction = craftComponent(
  'toolbarAction',
  {},
  (input: {
    readonly key: string;
    readonly content: ContentSlot;
    readonly trigger: () => void;
    readonly disabled?: () => boolean;
  }) =>
    button(
      'action',
      {
        class: componentUi.button,
        'data-componentButton': 'primary',
        type: 'button',
        disabled: input.disabled?.(),
        click: input.trigger,
      },
      renderContent(input.content),
    ),
);

type ToolbarActionContractFromComponent = ProjectionContractOf<
  typeof toolbarAction
>;
export type ToolbarActionSlot =
  ProjectionSlot<ToolbarActionContractFromComponent>;
