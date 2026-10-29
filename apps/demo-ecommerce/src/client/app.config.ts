import {
  provideCraftDebugReplayBridge,
  provideCraftDebugSessionCapture,
  provideCraftGuidedResumeChat,
  provideCraftGuidedResume,
  provideCraftRootComponent,
} from '@craft-ts/component';
import {
  craftAppConfig,
  provideCraftDevTools,
  provideCraftRouter,
  provideDefaultServerFunctionTransport,
  provideCorrelationIdTracking,
  provideGlobalPersisterHandlerService,
  provideLocalStoragePersister,
  provideSessionStoragePersister,
  provideStoragePersister,
  provideStorageService,
  LocalStoragePersister,
  SessionStorageService,
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
          ...provideCraftDevTools({
            logServerUrl: `${localLogServerUrl}/logs`,
            ...(import.meta.env['VITE_CRAFT_MCP_BRIDGE_URL']
              ? { mcpBridgeUrl: import.meta.env['VITE_CRAFT_MCP_BRIDGE_URL'] }
              : {}),
          }),
          provideCraftDebugSessionCapture({
            webSocketUrl: `${localLogServerUrl.replace(/^http/, 'ws')}/sessions/ws`,
            captureInputValues: localSessionCaptureEnabled,
            captureSensitiveInputValues: localSessionCaptureEnabled,
            captureBrowserStorage: localSessionCaptureEnabled,
            captureReplayArguments: localSessionCaptureEnabled,
            captureReplaySnapshots: {
              appVersion: 'demo-ecommerce',
              debounceMs: 120,
            },
          }),
          // An AI resumes a recorded session through the registry MCP.
          ...provideCraftGuidedResume({ logServerUrl: localLogServerUrl }),
          ...provideCraftGuidedResumeChat({ logServerUrl: localLogServerUrl }),
          ...provideCraftDebugReplayBridge({
            parentOrigins: [
              localReplayDashboardOrigin,
              localReplayDashboardOrigin.replace('localhost', '127.0.0.1'),
            ],
          }),
          ...provideCorrelationIdTracking(),
        ]
      : []),
    provideGlobalPersisterHandlerService(),
    provideLocalStoragePersister(),
    provideSessionStoragePersister(),
    provideStoragePersister(function* () {
      return yield* LocalStoragePersister();
    }),
    provideStorageService(function* () {
      return yield* SessionStorageService();
    }),
    provideCraftRootComponent(AppShell),
    provideCraftRouter(appRoutes.toRoutes()),
    provideDefaultServerFunctionTransport(),
  ],
});

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.replace(/^\[|\]$/g, '');
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    );
  } catch {
    return false;
  }
}
