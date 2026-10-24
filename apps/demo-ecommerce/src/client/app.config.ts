import {
  provideCraftDebugReplayBridge,
  provideCraftDebugSessionCapture,
  provideCraftRootComponent,
} from '@craft-ts/component';
import {
  craftAppConfig,
  provideCraftDevTools,
  provideCraftRouter,
  provideDefaultServerFunctionTransport,
  provideCorrelationIdTracking,
} from '@craft-ts/core';
import { AppShell } from './app-shell';
import { appRoutes } from './app.routes';

const localLogServerUrl =
  import.meta.env['VITE_CRAFT_LOG_SERVER_URL'] ?? 'http://127.0.0.1:4319';
const localReplayDashboardOrigin =
  import.meta.env['VITE_CRAFT_REPLAY_DASHBOARD_ORIGIN'] ??
  'http://localhost:4210';
const localSessionCaptureEnabled = isLoopbackUrl(localLogServerUrl);

export const appConfig = craftAppConfig({
  providers: [
    ...(import.meta.env.DEV
      ? [
          ...provideCraftDevTools({ logServerUrl: `${localLogServerUrl}/logs` }),
          provideCraftDebugSessionCapture({
            webSocketUrl: `${localLogServerUrl.replace(/^http/, 'ws')}/sessions/ws`,
            captureInputValues: localSessionCaptureEnabled,
            captureSensitiveInputValues: localSessionCaptureEnabled,
            captureBrowserStorage: localSessionCaptureEnabled,
            captureReplayArguments: localSessionCaptureEnabled,
          }),
          provideCraftDebugReplayBridge({
            parentOrigins: [
              localReplayDashboardOrigin,
              localReplayDashboardOrigin.replace('localhost', '127.0.0.1'),
            ],
          }),
          ...provideCorrelationIdTracking(),
        ]
      : []),
    provideCraftRootComponent(AppShell),
    provideCraftRouter(appRoutes.toRoutes()),
    provideDefaultServerFunctionTransport(),
  ],
});

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.replace(/^\[|\]$/g, '');
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
}
