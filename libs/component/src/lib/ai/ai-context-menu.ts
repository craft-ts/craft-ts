import { craftService, craftUse, fromEventToSource$ } from '@craft-ts/core';
import { craftComponent } from '../component';
import { button, div, span } from '../hyperscript';
import type { CraftComponent, Input, InputValue, Output } from '../types';
import { AI_OVERLAY_THEME } from './ai-overlay-theme';


/**
 * Closes the menu on any interaction outside of it.
 *
 * The subscriptions belong to a service so a rerender keeps the ones the first
 * render opened instead of stacking new ones on top of them.
 */
const { AiContextMenuDismissal, provideAiContextMenuDismissal } = craftService(
  { name: 'aiContextMenuDismissal', providedIn: 'toProvide' },
  (onDismiss: Output<() => void>) => {
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
    return {};
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
    styles: `${AI_OVERLAY_THEME}
      :scope {
        position: fixed;
        min-width: 180px;
        background: var(--craft-ai-bg);
        border: 1px solid var(--craft-ai-border);
        border-radius: 6px;
        box-shadow: 0 8px 24px var(--craft-ai-shadow);
        padding: 4px;
        pointer-events: auto;
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        font-size: 13px;
        color: var(--craft-ai-text);
      }
      :scope .craft-ai-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 10px;
        background: transparent;
        border: none;
        text-align: left;
        color: var(--craft-ai-text);
        cursor: pointer;
        border-radius: 4px;
      }
      :scope .craft-ai-menu-item:hover {
        background: var(--craft-ai-surface-muted);
      }
    `,
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
        class: 'craft-ai-menu',
        role: 'menu',
        tabIndex: -1,
        'aria-label': 'Component actions',
        style: () => ({
          left: `${craftUse(x())}px`,
          top: `${craftUse(y())}px`,
        }),
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
        [span({ 'aria-hidden': 'true' }, '✨'), span('Add to AI context')],
      ),
    );
  },
) as unknown as CraftComponent<{
  readonly x: InputValue<number>;
  readonly y: InputValue<number>;
  readonly onSelect: () => void;
  readonly onDismiss: () => void;
}, any>;
