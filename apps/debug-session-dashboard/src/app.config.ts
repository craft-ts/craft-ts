import {
  provideCraftRootComponent,
  provideSendContextToAi,
} from '@craft-ts/component';
import { craftAppConfig, provideCraftSecurityPolicy } from '@craft-ts/core';
import { DebugSessionDashboard } from './dashboard';
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
    provideCraftRootComponent(DebugSessionDashboard),
  ],
});
