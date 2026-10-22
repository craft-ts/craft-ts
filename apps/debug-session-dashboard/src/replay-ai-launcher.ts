import { craftComponent, span, type Output } from '@craft-ts/component';
import { AiChatBridge } from './replay-ai-bridge.service';

/**
 * The assistant's chat opens from a launcher the app mounts, which by default is
 * a floating button over the page. Here the button lives with the other controls
 * of the playbar: the launcher that is mounted draws nothing and only hands over
 * the way to open the chat.
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
    return span({ hidden: true });
  },
);
