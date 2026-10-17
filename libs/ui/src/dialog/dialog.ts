import {
  craftComponent,
  dialog,
  div,
  headingRoot,
  p,
  renderContent,
  type ContentSlot,
  type Input,
  type Output,
} from '@craft-ts/component';
import { DocIcon } from '../icon/icon.ts';
import { button } from '@craft-ts/component';
import { iconButtonUi } from '../button/button.style.ts';
import { dialogUi } from './dialog.style.ts';

export interface DialogInput {
  /** The dialog's name: its visible heading and its accessible label. */
  readonly heading: Input<string>;
  /** Ties the dialog to its heading. Unique on the page. */
  readonly dialogId: Input<string>;
  readonly open: Input<boolean>;
  readonly body: ContentSlot;
  /** Asked for by the close button, the Escape key, and a click on the scrim. */
  readonly dismiss: Output<() => void>;
}

/**
 * A modal dialog. The `<dialog>` is always in the tree and only its `open` state
 * changes: while `open` is true it was opened with `showModal()` — the renderer
 * does that for a `dialog` node given `open: true` — so focus is trapped, Escape
 * closes, and the page behind is inert without a line of focus code here.
 *
 * Keeping it mounted, rather than creating it on open, is what lets a control
 * inside it (the field of a search) already exist when the browser looks for
 * something to focus; and it keeps what was typed while the dialog is closed.
 */
export const DocDialog = craftComponent(
  'DocDialog',
  {},
  function* (props: DialogInput) {
    const open = yield* props.open();
    const headingText = yield* props.heading();
    const id = yield* props.dialogId();

    return div([
      dialog(
        {
          class: dialogUi.root,
          open,
          labelledBy: `${id}-title`,
          onClose: () => props.dismiss(),
        },
        // A dialog is its own outline: a heading in its body starts again at h1. Its
        // own title is not a heading: the page's h1 stays the only one in the HTML a
        // crawler reads, and `aria-labelledby` names the dialog all the same.
        headingRoot([
          div({ class: dialogUi.header }, [
            p({ id: `${id}-title`, class: dialogUi.title }, headingText),
            button(
              'docDialogClose',
              {
                type: 'button',
                class: iconButtonUi.root,
                'aria-label': 'Close',
                click: () => props.dismiss(),
              },
              [
                DocIcon({
                  name: function* () {
                    return 'close' as const;
                  },
                  size: function* () {
                    return 'md' as const;
                  },
                }),
              ],
            ),
          ]),
          div({ class: dialogUi.body }, renderContent('body', props.body)),
        ]),
      ),
    ]);
  },
);
