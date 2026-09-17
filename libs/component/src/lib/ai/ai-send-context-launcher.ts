import { craftComponent } from '../component';
import { button, span } from '../hyperscript';
import type { CraftComponent, Output } from '../types';

/**
 * Default bottom-right launcher for the session chat.
 *
 * Apps put their own floating controls in the same corner, so the offsets are
 * CSS custom properties (`--craft-ai-launcher-right` / `-bottom`) an app can
 * move from its own stylesheet rather than having to replace the component.
 */
export const AiSendContextLauncher: CraftComponent<{
  onOpen: Output<() => void>;
}> = craftComponent(
  'AiSendContextLauncher',
  {
    styles: `
      /*
       * The template root IS the button, so every rule lives on \`:scope\`: a
       * \`:scope button\` (or \`:scope .class\`) rule is a *descendant* selector
       * and would never match the root — which is how this button ended up
       * unstyled and, worse, inheriting the overlay's \`pointer-events: none\`.
       */
      :scope {
        position: fixed;
        right: var(--craft-ai-launcher-right, 20px);
        bottom: var(--craft-ai-launcher-bottom, 20px);
        z-index: 1;
        /* The overlay host disables pointer events so the app stays usable. */
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        background: #2563eb;
        color: #ffffff;
        box-shadow: 0 8px 24px rgba(37, 99, 235, 0.35);
        cursor: pointer;
        transition: background-color 120ms ease, transform 120ms ease;
      }
      :scope:hover {
        background: #1d4ed8;
      }
      :scope:active {
        transform: translateY(1px);
      }
      :scope:focus-visible {
        outline: 2px solid #1d4ed8;
        outline-offset: 2px;
      }
    `,
  },
  ({ onOpen }: { readonly onOpen: Output<() => void> }) =>
    button(
      'aiContextLauncher',
      {
        type: 'button',
        class: 'craft-ai-launcher',
        title: 'Send context to AI',
        'aria-label': 'Open AI context chat',
        click: () => onOpen(),
      },
      [span({ 'aria-hidden': 'true' }, '✨'), span('AI context')],
    ),
);
