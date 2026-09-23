import { craftUse, fromEventToSource$ } from '@craft-ts/core';
import { craftComponent } from '../component';
import { button, div, span } from '../hyperscript';
import type { Input, Output } from '../types';
import { assign, unit } from '@craft-ts/style';
import { aiMenu, aiTheme, menuPosition } from './ai-overlay.style';

/**
 * Context menu shown at the pointer position when a component is
 * right-clicked. Mounted imperatively by the AI overlay controller.
 */
export const AiContextMenu = craftComponent(
  'AiContextMenu',
  {},
  (
    x: Input<number>,
    y: Input<number>,
    onSelect: Output<() => void>,
    onDismiss: Output<() => void>,
  ) => {
    // Clicks inside the menu stop propagating, so anything reaching the
    // document is an outside click.
    fromEventToSource$<MouseEvent>(document, 'click').subscribe(() =>
      onDismiss(),
    );
    fromEventToSource$<KeyboardEvent>(document, 'keydown').subscribe(
      (event) => {
        if (event.key === 'Escape') {
          onDismiss();
        }
      },
    );

    return { x, y, onSelect, onDismiss };
  },
  ({ x, y, onSelect }) =>
    div(
      'aiContextMenu',
      {
        class: [aiTheme.root, aiMenu.root],
        role: 'menu',
        tabIndex: -1,
        'aria-label': 'Component actions',
        // Where the pointer was: a typed variable, read by the sheet.
        style: () => ({
          ...assign(menuPosition.x, unit.px(craftUse(x()))),
          ...assign(menuPosition.y, unit.px(craftUse(y()))),
        }),
        click: (event: MouseEvent) => event.stopPropagation(),
        contextmenu: (event: MouseEvent) => event.preventDefault(),
      },
      button(
        'aiSendToIa',
        {
          type: 'button',
          role: 'menuitem',
          class: aiMenu.item,
          click: () => onSelect(),
        },
        [span({ 'aria-hidden': 'true' }, '✨'), span('Add to AI context')],
      ),
    ),
);
