import {
  CraftHttpClient,
  craftService,
  query,
} from '@craft-ts/core';
import {
  compareSessionTraces,
  normalizeSessionTrace,
} from '@craft-ts/session-trace';
import { isRecord } from './replay-model';

const SESSION_SERVER_URL =
  import.meta.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] ??
  'http://127.0.0.1:4319';
const DASHBOARD_URL =
  import.meta.env['VITE_CRAFT_SESSION_DASHBOARD_URL'] ??
  'http://localhost:4210/';
const rawDecoder = { decode: (input: unknown) => input };

/** Fetches a failed E2E run and all its green references in one archive request. */
export const { E2eComparison } = craftService(
  { name: 'e2eComparison', providedIn: 'global' },
  function* () {
    yield* query('comparison', {
      method: (hash: string) => hash,
      loader: function* ({ params: hash }) {
        const params = new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
        const testId = params.get('test') ?? '';
        const project = params.get('project') ?? '';
        const sessionId = params.get('run') ?? '';
        if (!testId || !project || !sessionId)
          throw new Error('Le lien doit préciser test, projet et run.');
        const request = yield* CraftHttpClient.get(({ response }) => ({
          url: `${SESSION_SERVER_URL}/e2e-sessions/compare?${new URLSearchParams({ test: testId, project, run: sessionId })}`,
          success: response(rawDecoder),
        }));
        return request.then((payload) => {
          if (!isRecord(payload) || !isRecord(payload['observed']) || !Array.isArray(payload['baselines']))
            throw new Error('La réponse de comparaison E2E est invalide.');
          const observed = payload['observed'];
          const baselines = payload['baselines'].flatMap((item) =>
            isRecord(item) && isRecord(item['session']) && typeof item['source'] === 'string'
              ? [{ source: item['source'], trace: normalizeSessionTrace(item['session'] as never) }]
              : [],
          );
          const observedTrace = normalizeSessionTrace(observed as never);
          const baselineTrace = baselines[0]?.trace;
          const sessionUrl = (source: string) => new URL(source, SESSION_SERVER_URL).toString();
          return {
            testId,
            project,
            sessionId,
            baselineCount: baselines.length,
            baselineSource: baselines[0]?.source ? sessionUrl(baselines[0].source) : '',
            observedSource: typeof payload['observedSource'] === 'string'
              ? sessionUrl(payload['observedSource'])
              : `${SESSION_SERVER_URL}/sessions/${encodeURIComponent(sessionId)}`,
            dashboardUrl: DASHBOARD_URL,
            baselineDurationMs: baselineTrace?.steps.at(-1)?.elapsedMs ?? 0,
            observedDurationMs: observedTrace.steps.at(-1)?.elapsedMs ?? 0,
            comparison: compareSessionTraces(observedTrace, baselines.map(({ trace }) => trace)),
          };
        });
      },
    });
  },
);
