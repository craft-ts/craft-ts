import { craftComponent } from '../component';
import { button, span } from '../hyperscript';
import type { CraftComponent, Output } from '../types';
import { aiLauncher, aiTheme } from './ai-overlay.style';

/**
 * Default bottom-right launcher for the session chat.
 *
 * Apps put their own floating controls in the same corner, so the offsets are
 * typed theme variables (`--craft-ai-launcher-right` / `-bottom`, see
 * `ai-overlay.style.ts`) an app can move rather than replace the component.
 */
export const AiSendContextLauncher: CraftComponent<{
  onOpen: Output<() => void>;
}> = craftComponent(
  'AiSendContextLauncher',
  {},
  (onOpen: Output<() => void>) => ({ onOpen }),
  ({ onOpen }) =>
    button(
      'aiContextLauncher',
      {
        type: 'button',
        class: [aiTheme.root, aiLauncher.root],
        title: 'Send context to AI',
        'aria-label': 'Open AI context chat',
        click: () => onOpen(),
      },
      [span({ 'aria-hidden': 'true' }, '✨'), span('AI context')],
    ),
);
