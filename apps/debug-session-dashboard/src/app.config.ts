import {
  provideCraftRootComponent,
  provideSendContextLauncherComponent,
  provideSendContextToAi,
} from '@craft-ts/component';
import {
  RealCraftTemporalRuntime,
  craftAppConfig,
  provideCraftSecurityPolicy,
  provideCraftRouter,
  provideCraftTemporalRuntime,
  withHashLocation,
} from '@craft-ts/core';
import { DebugSessionDashboard } from './dashboard';
import { AiChatLauncherBridge } from './replay-ai-launcher';
import { THUMBNAIL_ORIGIN } from './thumbnail-archive.service';
import { dashboardRoutes } from './app.routes';

export const appConfig = craftAppConfig({
  providers: [
    // The thumbnails are pictures served by the local archive, not by this page.
    provideCraftSecurityPolicy({
      dom: {
        allowedResourceOrigins: [
          THUMBNAIL_ORIGIN,
          'http://localhost:4210',
          'http://localhost:4211',
        ],
      },
    }),
    // The chat UI needs the session service even when the dashboard itself
    // must not record a second session. `recording: false` provides the
    // session without starting a capture clip.
    provideSendContextToAi({ recording: true }),
    // The chat's panel is dragged by a pointer gesture, which reads the clock
    // from the injector and has no fallback: without it the panel stays empty.
    provideCraftTemporalRuntime(new RealCraftTemporalRuntime()),
    // A floating Report button opens the chat across the dashboard; the replay
    // page hides it and keeps its action in the playback bar.
    provideSendContextLauncherComponent(() => AiChatLauncherBridge),
    provideCraftRootComponent(DebugSessionDashboard),
    provideCraftRouter(dashboardRoutes.toRoutes(), withHashLocation()),
  ],
});
