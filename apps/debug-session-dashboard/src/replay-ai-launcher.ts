import {
  AiSendContextLauncher,
  craftComponent,
  type Output,
} from '@craft-ts/component';
import { AiChatBridge } from './replay-ai-bridge.service';
import { ReplayState } from './replay-state';

/**
 * The assistant chat opens from the same floating Report button on every
 * dashboard page, including the replay.
 */
/** Provided in place of the default launcher (`provideSendContextLauncherComponent`). */
export const AiChatLauncherBridge = craftComponent(
  'AiChatLauncherBridge',
  {},
  // The launcher is mounted once per opening of the chat, and that mount is the
  // only moment it hands its `onOpen` over: it is a registration, not a render.
  function* (inputs: { readonly onOpen: Output<() => void> }) {
    // The page this hides on is dashboard state: built before the first read,
    // or the read would see the starting value and never follow it.
    yield* ReplayState();
    const chat = yield* AiChatBridge();
    yield* chat.register(() => inputs.onOpen());
    return AiSendContextLauncher({ onOpen: inputs.onOpen, label: 'Report' });
  },
);
