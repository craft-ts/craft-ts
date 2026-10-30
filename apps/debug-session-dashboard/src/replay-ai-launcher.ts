import {
  AiSendContextLauncher,
  craftComponent,
  div,
  type Output,
} from '@craft-ts/component';
import { AiChatBridge } from './replay-ai-bridge.service';
import { page } from './replay-state';

/**
 * The assistant chat opens from a floating Report button on dashboard pages.
 * During a replay, the playbar owns the button, so this launcher is hidden.
 */
/** Provided in place of the default launcher (`provideSendContextLauncherComponent`). */
export const AiChatLauncherBridge = craftComponent(
  'AiChatLauncherBridge',
  {},
  // The launcher is mounted once per opening of the chat, and that mount is the
  // only moment it hands its `onOpen` over: it is a registration, not a render.
  function* (inputs: { readonly onOpen: Output<() => void> }) {
    const chat = yield* AiChatBridge();
    yield* chat.register(() => inputs.onOpen());
    return div(
      {
        hidden: function* () {
          return page() === 'detail';
        },
      },
      AiSendContextLauncher({ onOpen: inputs.onOpen, label: 'Report' }),
    );
  },
);
