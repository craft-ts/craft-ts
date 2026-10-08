import {
  craftService,
  craftExpose,
  type CraftServiceInput,
} from '@craft-ts/core';
import {
  button,
  craftComponent,
  renderContent,
  span,
  type ContentSlot,
  type Input,
  type ProjectionContractOf,
  type ProjectionSlot,
  withComponentProviders,
} from '@craft-ts/component';
import { componentUi, projectionDemo } from './component-demos.style';

export const { UserBadgeView, provideUserBadgeView } = craftService(
  { name: 'userBadgeView', providedIn: 'toProvide' },
  function* (inputs: {
    readonly $provided: { readonly role: CraftServiceInput<string> };
  }) {
    const { role } = inputs.$provided;
    yield* craftExpose('role', role);
  },
);

export const userBadge = craftComponent(
  'userBadge',
  {},
  (inputs: { readonly role: Input<string> }) =>
    span({ class: projectionDemo.badge }, inputs.role),
).pipe(
  withComponentProviders(({ role }) => [provideUserBadgeView({ role })]),
);

type ToolbarActionContract = {
  readonly kind: 'toolbar-action';
  readonly trigger: () => void;
  readonly disabled: () => boolean;
};

export const { ToolbarActionView, provideToolbarActionView } = craftService(
  { name: 'toolbarActionView', providedIn: 'toProvide' },
  function* (input: {
    readonly $provided: {
      readonly key: string;
      readonly content: ContentSlot;
      readonly trigger: () => void;
      readonly disabled?: () => boolean;
    };
  }) {
    yield* craftExpose('key', input.$provided.key);
    yield* craftExpose('contract', {
      kind: 'toolbar-action',
      trigger: input.$provided.trigger,
      disabled: input.$provided.disabled ?? (() => false),
    } satisfies ToolbarActionContract);
    yield* craftExpose('content', input.$provided.content);
  },
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
).pipe(
  withComponentProviders(({ key, content, trigger, disabled }) => [
    provideToolbarActionView({ key, content, trigger, disabled }),
  ]),
);

type ToolbarActionContractFromComponent = ProjectionContractOf<
  typeof toolbarAction
>;
export type ToolbarActionSlot =
  ProjectionSlot<ToolbarActionContractFromComponent>;
