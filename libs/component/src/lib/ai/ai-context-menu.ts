import { craftService, craftUse, fromEventToSource$ } from '@craft-ts/core';
import { craftComponent } from '../component';
import { button, div, span } from '../hyperscript';
import type { CraftComponent, Input, InputValue, Output } from '../types';
import { assign, unit } from '@craft-ts/style';
import { aiMenu, aiTheme, menuPosition } from './ai-overlay.style';

/**
 * Closes the menu on any interaction outside of it.
 *
 * The subscriptions belong to a service so a rerender keeps the ones the first
 * render opened instead of stacking new ones on top of them.
 */
const { AiContextMenuDismissal, provideAiContextMenuDismissal } = craftService(
  { name: 'aiContextMenuDismissal', providedIn: 'toProvide' },
  function* (onDismiss: Output<() => void>) {
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
  },
);

/**
 * Context menu shown at the pointer position when a component is
 * right-clicked. Mounted imperatively by the AI overlay controller.
 */
export const AiContextMenu = craftComponent(
  'AiContextMenu',
  {
    providers: [provideAiContextMenuDismissal()],
  },
  function* (inputs: {
    readonly x: Input<number>;
    readonly y: Input<number>;
    readonly onSelect: Output<() => void>;
    readonly onDismiss: Output<() => void>;
  }) {
    const { x, y, onSelect } = inputs;
    yield* AiContextMenuDismissal(inputs.onDismiss);
    return div(
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
    );
  },
) as unknown as CraftComponent<
  {
    readonly x: InputValue<number>;
    readonly y: InputValue<number>;
    readonly onSelect: () => void;
    readonly onDismiss: () => void;
  },
  any
>;
