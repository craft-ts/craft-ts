import { craftService, craftExpose } from '@craft-ts/core';
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
import { projectionDemo } from './component-demos.style';

export const toolbar = craftComponent(
  'toolbar',
  {},
  (input: { readonly actions: ToolbarActionSlot }) => {
    const { actions } = input;
    return div(
      { class: projectionDemo.toolbar, role: 'toolbar' },
      forNode(actions, { track: (action) => action.key }, (action) =>
        renderContent(action),
      ),
    );
  },
);

export const { DialogView, provideDialogView } = craftService(
  { name: 'dialogView', providedIn: 'toProvide' },
  function* (input: {
    readonly body?: ContentSlot;
    readonly actions: readonly ProjectionOf<typeof toolbarAction>[];
  }) {
    yield* craftExpose('body', input.body ?? content(() => p('No dialog content provided.')));
    yield* craftExpose('actions', input.actions);
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
    return section({ class: projectionDemo.dialog, role: 'dialog' }, [
      renderContent(body),
      footer(
        { class: projectionDemo.toolbar },
        forNode(actions, { track: (action) => action.key }, (action) =>
          renderContent(action),
        ),
      ),
    ]);
  },
);
