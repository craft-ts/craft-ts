import {
  provideCraftRootComponent,
  provideSendContextToAi,
} from '@craft-ts/component';
import { craftAppConfig } from '@craft-ts/core';
import { DebugSessionDashboard } from './dashboard';

export const appConfig = craftAppConfig({
  providers: [
    // The chat UI needs the session service even when the dashboard itself
    // must not record a second session. `recording: false` provides the
    // session without starting a capture clip.
    provideSendContextToAi({ recording: false }),
    provideCraftRootComponent(DebugSessionDashboard),
  ],
});
