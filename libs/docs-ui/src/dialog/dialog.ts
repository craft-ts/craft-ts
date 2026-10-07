import {
  craftComponent,
  dialog,
  div,
  h,
  renderContent,
  type ContentSlot,
  type CraftNodeChild,
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
 * A modal dialog. While `open` is true a native `<dialog>` is on screen and was
 * opened with `showModal()` — the renderer does that for a `dialog` node given
 * `open: true` — so focus is trapped, Escape closes, and the page behind is
 * inert without a line of focus code here. When it closes the node is gone.
 */
export const DocDialog = craftComponent('DocDialog', {}, function* (
  props: DialogInput,
) {
  const open = yield* props.open();
  const heading = yield* props.heading();
  const id = yield* props.dialogId();

  const children: CraftNodeChild[] = [];
  if (open) {
    children.push(
      dialog(
        {
          class: dialogUi.root,
          open: true,
          labelledBy: `${id}-title`,
          onClose: () => props.dismiss(),
        },
        [
          div({ class: dialogUi.header }, [
            h('h2', { id: `${id}-title`, class: dialogUi.title }, heading),
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
        ],
      ),
    );
  }
  return div(children);
});
