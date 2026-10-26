import {
  provideCraftDebugReplayBridge,
  provideCraftDebugSessionCapture,
  provideCraftRootComponent,
  resumeSourceHashRecordsOf,
} from '@craft-ts/component';
import type {
  ResumePreflightAdapter,
  ResumePreflightFact,
  ResumeGraphArtifact,
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
import { demoAccounts } from '../shared/accounts';

const localLogServerUrl =
  import.meta.env['VITE_CRAFT_LOG_SERVER_URL'] ?? 'http://127.0.0.1:4319';
const localReplayDashboardOrigin =
  import.meta.env['VITE_CRAFT_REPLAY_DASHBOARD_ORIGIN'] ??
  'http://localhost:4210';
const localSessionCaptureEnabled = isLoopbackUrl(localLogServerUrl);
const resumePreflightAdapter: ResumePreflightAdapter = {
  async isReadOnlyRequest(request) {
    try {
      const url = new URL(request.url);
      if (url.origin !== location.origin) return false;
      if (url.pathname === '/__craft_resume_graph')
        return request.method === 'GET';
      if (url.pathname !== '/__server-functions' || request.method !== 'POST')
        return false;
      const body: unknown = await request.clone().json();
      return (
        typeof body === 'object' &&
        body !== null &&
        'id' in body &&
        body.id === 'ecommerce.resume.facts'
      );
    } catch {
      return false;
    }
  },
  async readFacts(manifest) {
    const facts = manifest.entries.flatMap((entry) =>
      entry.level === 'required' &&
      entry.kind === 'entity' &&
      (entry.detail === 'product' || entry.detail === 'category')
        ? [{ kind: entry.detail, name: entry.name }]
        : [],
    );
    if (facts.length === 0) return [];
    const response = await fetch('/__server-functions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-craft-protocol': '1' },
      body: JSON.stringify({
        id: 'ecommerce.resume.facts',
        input: { facts },
      }),
    });
    if (!response.ok)
      throw new Error(`Pré-vol backend refusé (HTTP ${response.status}).`);
    const body: unknown = await response.json();
    const decoded =
      typeof body === 'string' ? (JSON.parse(body) as unknown) : body;
    if (!Array.isArray(decoded))
      throw new Error('Réponse de pré-vol backend invalide.');
    return decoded.filter(isResumePreflightFact) as ResumePreflightFact[];
  },
};
const resumeGraphAdapter = {
  isReadOnlyRequest: (request: Request) =>
    resumePreflightAdapter.isReadOnlyRequest?.(request) ?? false,
  async read(): Promise<ResumeGraphArtifact> {
    const response = await fetch('/__craft_resume_graph');
    if (!response.ok)
      throw new Error(
        `Graphe de reprise indisponible (HTTP ${response.status}).`,
      );
    const graph: unknown = await response.json();
    if (!isResumeGraphArtifact(graph))
      throw new Error('Graphe de reprise invalide.');
    return graph;
  },
};

export const appConfig = craftAppConfig({
  providers: [
    ...(import.meta.env.DEV
      ? [
          ...provideCraftDevTools({
            logServerUrl: `${localLogServerUrl}/logs`,
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
            captureResumeSourceHashes: async () =>
              resumeSourceHashRecordsOf(await resumeGraphAdapter.read()),
          }),
          provideCraftDebugReplayBridge({
            parentOrigins: [
              localReplayDashboardOrigin,
              localReplayDashboardOrigin.replace('localhost', '127.0.0.1'),
            ],
            resumePersonas: [
              ...demoAccounts.map((account) => ({
                role: account.role,
                id: account.id,
                params: { email: account.email, password: account.password },
              })),
              { role: 'guest', id: 'guest', params: {} },
            ],
            resumePreflightAdapter,
            resumeGraphAdapter,
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

function isResumePreflightFact(value: unknown): value is ResumePreflightFact {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof value.kind === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    (!('detail' in value) || typeof value.detail === 'string')
  );
}

function isResumeGraphArtifact(value: unknown): value is ResumeGraphArtifact {
  return (
    typeof value === 'object' &&
    value !== null &&
    'format' in value &&
    value.format === 'craft-resume-graph' &&
    'version' in value &&
    value.version === 1 &&
    'sourceHashes' in value &&
    typeof value.sourceHashes === 'object' &&
    value.sourceHashes !== null &&
    'nodes' in value &&
    Array.isArray(value.nodes) &&
    'edges' in value &&
    Array.isArray(value.edges)
  );
}
