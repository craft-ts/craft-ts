import {
  provideCraftRootComponent,
  provideSendContextLauncherComponent,
  provideSendContextToAi,
} from '@craft-ts/component';
import {
  RealCraftTemporalRuntime,
  craftAppConfig,
  provideCraftSecurityPolicy,
  provideCraftTemporalRuntime,
} from '@craft-ts/core';
import { DebugSessionDashboard } from './dashboard';
import { AiChatLauncherBridge } from './replay-ai-launcher';
import { THUMBNAIL_ORIGIN } from './thumbnail-archive.service';

export const appConfig = craftAppConfig({
  providers: [
    // The thumbnails are pictures served by the local archive, not by this page.
    provideCraftSecurityPolicy({
      dom: { allowedResourceOrigins: [THUMBNAIL_ORIGIN] },
    }),
    // The chat UI needs the session service even when the dashboard itself
    // must not record a second session. `recording: false` provides the
    // session without starting a capture clip.
    provideSendContextToAi({ recording: false }),
    // The chat's panel is dragged by a pointer gesture, which reads the clock
    // from the injector and has no fallback: without it the panel stays empty.
    provideCraftTemporalRuntime(new RealCraftTemporalRuntime()),
    // The chat opens from a button of the playbar, not from a floating one.
    provideSendContextLauncherComponent(() => AiChatLauncherBridge),
    provideCraftRootComponent(DebugSessionDashboard),
  ],
});
