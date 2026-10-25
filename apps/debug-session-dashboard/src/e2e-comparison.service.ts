import {
  CraftHttpClient,
  craftService,
  query,
} from '@craft-ts/core';
import {
  compareSessionTraces,
  normalizeSessionTrace,
  type SessionTraceComparison,
} from '@craft-ts/session-trace';
import { parseE2eComparisonResponse, portableEvents } from './replay-model';

const SESSION_SERVER_URL: string =
  import.meta.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] ??
  'http://127.0.0.1:4319';
const DASHBOARD_URL: string =
  import.meta.env['VITE_CRAFT_SESSION_DASHBOARD_URL'] ??
  'http://localhost:4210/';

export type E2eComparisonReport = Readonly<{
  testId: string;
  project: string;
  sessionId: string;
  baselineCount: number;
  baselineSource: string;
  observedSource: string;
  dashboardUrl: string;
  comparison: SessionTraceComparison;
}>;
/** The answer could not be read: shown as such, never thrown. */
export type E2eComparisonError = Readonly<{ error: string }>;

const sessionUrl = (source: string) => new URL(source, SESSION_SERVER_URL).toString();

function comparisonDecoder(run: Readonly<{ testId: string; project: string; sessionId: string }>) {
  return {
    decode(payload: unknown): E2eComparisonReport | E2eComparisonError {
      if (!run.testId || !run.project || !run.sessionId)
        return { error: 'le lien doit préciser test, projet et run.' };
      const answer = parseE2eComparisonResponse(payload);
      if (!answer) return { error: 'la réponse de comparaison E2E est invalide.' };
      return {
        ...run,
        baselineCount: answer.baselines.length,
        baselineSource: answer.baselines[0]?.source ? sessionUrl(answer.baselines[0].source) : '',
        observedSource: answer.observedSource
          ? sessionUrl(answer.observedSource)
          : `${SESSION_SERVER_URL}/sessions/${encodeURIComponent(run.sessionId)}`,
        dashboardUrl: DASHBOARD_URL,
        // The server computes it with the module the fixture and the MCP use;
        // an older server only sends the sessions, compared here instead.
        comparison: answer.comparison ?? compareSessionTraces(
          normalizeSessionTrace(portableEvents(answer.observed)),
          answer.baselines.map(({ session }) => normalizeSessionTrace(portableEvents(session))),
        ),
      };
    },
  };
}

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
        return yield* CraftHttpClient.get(({ response }) => ({
          url: `${SESSION_SERVER_URL}/e2e-sessions/compare?${new URLSearchParams({ test: testId, project, run: sessionId })}`,
          success: response(comparisonDecoder({ testId, project, sessionId })),
        }));
      },
      // The overload with insertions types `value` as the decoded report, not
      // as the HTTP request (same form as `archived` in session-archive.service).
    }, () => ({}));
  },
);
