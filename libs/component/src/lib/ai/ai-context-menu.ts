import { fromEventToSource$ } from '@craft-ng/core';
import { craftComponent } from '../component';
import { button, div, span } from '../hyperscript';
import type { Input, Output } from '../types';

/**
 * Context menu shown at the pointer position when a component is
 * right-clicked. Mounted imperatively by the AI overlay controller.
 */
export const AiContextMenu = craftComponent(
  'AiContextMenu',
  {
    styles: `
      .craft-ai-menu {
        position: fixed;
        min-width: 180px;
        background: #ffffff;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        padding: 4px;
        pointer-events: auto;
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        font-size: 13px;
        color: #111827;
      }
      .craft-ai-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 10px;
        background: transparent;
        border: none;
        text-align: left;
        cursor: pointer;
        border-radius: 4px;
      }
      .craft-ai-menu-item:hover {
        background: #f3f4f6;
      }
    `,
  },
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
        class: 'craft-ai-menu',
        role: 'menu',
        tabIndex: -1,
        'aria-label': 'Component actions',
        style: () => ({ left: `${x()}px`, top: `${y()}px` }),
        click: (event: MouseEvent) => event.stopPropagation(),
        contextmenu: (event: MouseEvent) => event.preventDefault(),
      },
      button(
        'aiSendToIa',
        {
          type: 'button',
          role: 'menuitem',
          class: 'craft-ai-menu-item',
          click: () => onSelect(),
        },
        [span({ 'aria-hidden': 'true' }, '✨'), span('Send to IA')],
      ),
    ),
);
