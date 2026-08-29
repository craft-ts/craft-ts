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
  (input: { readonly actions: ToolbarActionSlot }) => input,
  ({ actions }) =>
    div(
      { class: 'projection-demo__toolbar', role: 'toolbar' },
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
    section({ class: 'projection-demo__dialog', role: 'dialog' }, [
      renderContent(body),
      footer(
        { class: 'projection-demo__dialog-actions' },
        forNode(actions, { track: (action) => action.key }, (action) =>
          renderContent(action),
        ),
      ),
    ]),
);
