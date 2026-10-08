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
  (input: { readonly actions: ToolbarActionSlot }) =>
    div(
      { class: projectionDemo.toolbar, role: 'toolbar' },
      forNode(input.actions, { track: (action) => action.key }, (action) =>
        renderContent(action),
      ),
    ),
);

export const dialog = craftComponent(
  'dialog',
  {},
  (input: {
    readonly body?: ContentSlot;
    readonly actions: readonly ProjectionOf<typeof toolbarAction>[];
  }) =>
    section({ class: projectionDemo.dialog, role: 'dialog' }, [
      renderContent(
        input.body ?? content(() => p('No dialog content provided.')),
      ),
      footer(
        { class: projectionDemo.toolbar },
        forNode(input.actions, { track: (action) => action.key }, (action) =>
          renderContent(action),
        ),
      ),
    ]),
);
