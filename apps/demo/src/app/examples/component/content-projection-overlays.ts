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
  (input: { readonly actions: ToolbarActionSlot }) => input,
  ({ actions }) =>
    div(
      { class: projectionDemo.toolbar, role: 'toolbar' },
      forNode(actions, { track: (action) => action.key }, (action) =>
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
  }) => ({
    body: input.body ?? content(() => p('No dialog content provided.')),
    actions: input.actions,
  }),
  ({ body, actions }) =>
    section({ class: projectionDemo.dialog, role: 'dialog' }, [
      renderContent(body),
      footer(
        { class: projectionDemo.toolbar },
        forNode(actions, { track: (action) => action.key }, (action) =>
          renderContent(action),
        ),
      ),
    ]),
);
