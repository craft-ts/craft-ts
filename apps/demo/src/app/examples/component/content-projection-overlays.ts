import { craftService } from '@craft-ts/core';
import {
  content,
  craftComponent,
  div,
  footer,
  forNode,
  p,
  renderContent,
  section,
  type ContentSlot,
  type ProjectionOf,
} from '@craft-ts/component';
import { toolbarAction } from './content-projection-actions';
import type { ToolbarActionSlot } from './content-projection-actions';

export const toolbar = craftComponent(
  'toolbar',
  {},
  function* (input: { readonly actions: ToolbarActionSlot }) {
    const { actions } = input;
    return div(
      { class: 'projection-demo__toolbar', role: 'toolbar' },
      forNode(actions, { track: (action) => action.key }, (action) =>
        renderContent(action),
      ),
    );
  },
);

const { DialogView, provideDialogView } = craftService(
  { name: 'dialogView', providedIn: 'toProvide' },
  (input: {
    readonly body?: ContentSlot;
    readonly actions: readonly ProjectionOf<typeof toolbarAction>[];
  }) => {
    return {
      body: input.body ?? content(() => p('No dialog content provided.')),
      actions: input.actions,
    };
  },
);

export const dialog = craftComponent(
  'dialog',
  { providers: [provideDialogView()] },
  function* (input: {
    readonly body?: ContentSlot;
    readonly actions: readonly ProjectionOf<typeof toolbarAction>[];
  }) {
    const { body, actions } = yield* DialogView(input);
    return section({ class: 'projection-demo__dialog', role: 'dialog' }, [
      renderContent(body),
      footer(
        { class: 'projection-demo__dialog-actions' },
        forNode(actions, { track: (action) => action.key }, (action) =>
          renderContent(action),
        ),
      ),
    ]);
  },
);
