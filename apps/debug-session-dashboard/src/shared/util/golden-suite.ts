import {
  isGoldenSetManifest,
  type GoldenSetManifest,
  type GoldenSetRejection,
} from '@craft-ts/session-trace';
import { isRecord } from './replay-model';
import { sessionDate } from './replay-labels';
import { i18n } from './catalog';

/**
 * The suite page reads what the archive proposes as an app's regression
 * suite (`POST /sessions/golden-set`): the recorded sessions kept, what each
 * one alone shows, the paths no session shows any more. It can have the
 * archive replay one session as the suite does (`POST
 * /sessions/:id/suite-replay`). This module reads both answers and words them.
 */

export type GoldenSuite = Readonly<{
  manifest: GoldenSetManifest;
  rejected: readonly GoldenSetRejection[];
  /** Units an eligible session shows, left out by the size of the set. */
  uncovered: readonly string[];
  /** Sessions of this app the selection looked at. */
  candidates: number;
}>;

export const goldenSuiteDecoder = {
  decode(input: unknown): GoldenSuite | undefined {
    if (!isRecord(input) || !isGoldenSetManifest(input['manifest'])) return undefined;
    return {
      manifest: input['manifest'],
      rejected: Array.isArray(input['rejected'])
        ? input['rejected'].filter(isRejection)
        : [],
      uncovered: stringList(input['uncovered']),
      candidates: typeof input['candidates'] === 'number' ? input['candidates'] : 0,
    };
  },
};

export type SuiteReplayOutcome = Readonly<{
  sessionId: string;
  status: string;
  replayIndex: number;
  total: number;
  message?: string;
  unprovenInteractions: readonly string[];
  /** Actions at the end of the recording the replay left out. */
  droppedSteps: number;
}>;

/** A suite run: each session's replay, and whether the whole run passed. */
export type SuiteRun = Readonly<{
  passed: boolean;
  results: readonly SuiteReplayOutcome[];
}>;

export const suiteRunDecoder = {
  decode(input: unknown): SuiteRun | undefined {
    if (!isRecord(input) || !Array.isArray(input['results'])) return undefined;
    const results = input['results'].flatMap((result) => {
      const outcome = suiteReplayDecoder.decode(result);
      return outcome ? [outcome] : [];
    });
    return { passed: input['passed'] === true, results };
  },
};

export const suiteReplayDecoder = {
  decode(input: unknown): SuiteReplayOutcome | undefined {
    if (!isRecord(input) || typeof input['sessionId'] !== 'string' || typeof input['status'] !== 'string')
      return undefined;
    const tailCut = isRecord(input['tailCut']) ? input['tailCut'] : undefined;
    return {
      sessionId: input['sessionId'],
      status: input['status'],
      replayIndex: typeof input['replayIndex'] === 'number' ? input['replayIndex'] : 0,
      total: typeof input['total'] === 'number' ? input['total'] : 0,
      ...(typeof input['message'] === 'string' ? { message: input['message'] } : {}),
      unprovenInteractions: stringList(input['unprovenInteractions']),
      droppedSteps: typeof tailCut?.['droppedSteps'] === 'number' ? tailCut['droppedSteps'] : 0,
    };
  },
};

/** The apps of the archive, by origin: the one recorded last first. */
export function suiteOrigins(
  sessions: readonly Readonly<{ startUrl: string; createdAt: string }>[],
): readonly string[] {
  const latest = new Map<string, string>();
  for (const session of sessions) {
    let origin: string;
    try {
      origin = new URL(session.startUrl).origin;
    } catch {
      continue;
    }
    const seen = latest.get(origin);
    if (!seen || seen < session.createdAt) latest.set(origin, session.createdAt);
  }
  return [...latest].sort((left, right) => (left[1] < right[1] ? 1 : -1)).map(([origin]) => origin);
}

export type SuiteSessionRow = Readonly<{
  sessionId: string;
  recorded: string;
  /** What the session covers, and what it alone covers. */
  meta: string;
  uniqueUnits: readonly string[];
  unverified: boolean;
}>;

export type SuiteRejectionRow = Readonly<{ sessionId: string; shortId: string; reason: string }>;

export type SuiteView = Readonly<{
  facts: readonly Readonly<{ label: string; value: string }>[];
  sessions: readonly SuiteSessionRow[];
  rejected: readonly SuiteRejectionRow[];
  toRecapture: readonly string[];
  uncovered: readonly string[];
}>;

const UNIQUE_UNITS_SHOWN = 6;

export function suiteView(suite: GoldenSuite | undefined): SuiteView {
  if (!suite) return { facts: [], sessions: [], rejected: [], toRecapture: [], uncovered: [] };
  const { manifest } = suite;
  return {
    facts: [
      { label: i18n.t('suiteFactCandidates'), value: String(suite.candidates) },
      { label: i18n.t('suiteFactKept'), value: String(manifest.sessions.length) },
      { label: i18n.t('suiteFactUnits'), value: String(new Set(manifest.sessions.flatMap((entry) => entry.units)).size) },
      { label: i18n.t('suiteFactToRecapture'), value: String(manifest.toRecapture.length) },
    ],
    sessions: manifest.sessions.map((entry) => ({
      sessionId: entry.sessionId,
      recorded: sessionDate.format(new Date(entry.recordedAt)),
      meta: i18n.t('suiteSessionMeta', { count: entry.units.length, total: entry.uniqueUnits.length }),
      uniqueUnits: entry.uniqueUnits.slice(0, UNIQUE_UNITS_SHOWN),
      unverified: entry.status === 'unverified',
    })),
    rejected: suite.rejected.map((rejection) => ({
      sessionId: rejection.sessionId,
      shortId: rejection.sessionId.slice(0, 8),
      reason: rejectionReason(rejection),
    })),
    toRecapture: manifest.toRecapture,
    uncovered: suite.uncovered,
  };
}

function rejectionReason(rejection: GoldenSetRejection): string {
  switch (rejection.reason) {
    case 'not-replayable':
      return i18n.t('suiteRejectedNotReplayable');
    case 'duplicate':
      return i18n.t('suiteRejectedDuplicate', { detail: (rejection.duplicateOf ?? '').slice(0, 8) });
    case 'redundant':
      return i18n.t('suiteRejectedRedundant');
    case 'over-budget':
      return i18n.t('suiteRejectedOverBudget');
  }
}

/** One replay as the suite runs it, in a line and a tone. */
export function describeSuiteReplay(
  outcome: SuiteReplayOutcome,
): Readonly<{ tone: 'important' | 'warning' | 'danger'; text: string }> {
  const steps = `${outcome.replayIndex}/${outcome.total}`;
  const cut = outcome.droppedSteps > 0 ? i18n.t('suiteReplayCut', { count: outcome.droppedSteps }) : '';
  if (outcome.status === 'completed' && outcome.unprovenInteractions.length === 0)
    return { tone: 'important', text: `${i18n.t('suiteReplayPassed', { detail: steps })}${cut}` };
  if (outcome.status === 'completed')
    return {
      tone: 'warning',
      text: `${i18n.t('suiteReplayUnproven', { count: outcome.unprovenInteractions.length, detail: steps })}${cut}`,
    };
  return {
    tone: 'danger',
    text: i18n.t('suiteReplayFailed', { name: outcome.status, detail: outcome.message ?? steps }),
  };
}

function isRejection(value: unknown): value is GoldenSetRejection {
  return isRecord(value) && typeof value['sessionId'] === 'string' && typeof value['reason'] === 'string';
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** What a kept session's row says about the last run: nothing unless it was in it. */
export function replayLineFor(
  run: SuiteRun | undefined,
  sessionId: string,
): Readonly<{ hidden: boolean; tone: string | undefined; text: string }> {
  const outcome = run?.results.find((result) => result.sessionId === sessionId);
  const line = outcome ? describeSuiteReplay(outcome) : undefined;
  return { hidden: line === undefined, tone: line?.tone, text: line?.text ?? '' };
}

/** The last run in a line: how many sessions replayed clean, out of how many. */
export function suiteRunLine(
  run: SuiteRun | undefined,
): Readonly<{ hidden: boolean; tone: string | undefined; text: string }> {
  if (!run || run.results.length === 0) return { hidden: true, tone: undefined, text: '' };
  const clean = run.results.filter(
    (result) => result.status === 'completed' && result.unprovenInteractions.length === 0,
  ).length;
  return {
    hidden: false,
    tone: run.passed ? 'important' : 'danger',
    text: i18n.t('suiteRunSummary', { count: clean, total: run.results.length }),
  };
}

/** The page's word on a run under way, or one the archive would not run. */
export function replayStatusLine(replaying: boolean, failed: boolean): string {
  return replaying ? i18n.t('suiteReplaying') : failed ? i18n.t('suiteReplayUnavailable') : '';
}

export type SessionsCheckVerdict = 'regression' | 'changed' | 'flaky' | 'stale' | 'unchanged';

/** A session of the last `sessions:check`, as the suite page needs it. */
export type SessionsCheckSession = Readonly<{
  sessionId: string;
  verdict: SessionsCheckVerdict;
  reason: string;
  approved: boolean;
  /** On a change: the moments that differ. */
  moments: readonly number[];
}>;

/** The last base-against-head check of the app (`GET /sessions/check`). */
export type SessionsCheck = Readonly<{
  app: string;
  base: string;
  head: string;
  passed: boolean;
  sessions: readonly SessionsCheckSession[];
}>;

const VERDICTS: readonly SessionsCheckVerdict[] = ['regression', 'changed', 'flaky', 'stale', 'unchanged'];

/** The archive's answer: no `check` when the app was never checked — a value, not a failure. */
export type SessionsCheckAnswer = Readonly<{ check?: SessionsCheck }>;

export const sessionsCheckDecoder = {
  decode(input: unknown): SessionsCheckAnswer | undefined {
    if (!isRecord(input)) return undefined;
    const report = input['report'];
    if (report === null) return {};
    if (!isRecord(report) || !Array.isArray(report['sessions'])) return undefined;
    return { check: {
      app: typeof input['app'] === 'string' ? input['app'] : '',
      base: typeof report['base'] === 'string' ? report['base'] : '',
      head: typeof report['head'] === 'string' ? report['head'] : '',
      passed: report['passed'] === true,
      sessions: report['sessions'].flatMap((session): SessionsCheckSession[] => {
        if (!isRecord(session) || typeof session['sessionId'] !== 'string') return [];
        const verdict = VERDICTS.find((item) => item === session['verdict']);
        if (!verdict) return [];
        const change = isRecord(session['change']) ? session['change'] : undefined;
        return [{
          sessionId: session['sessionId'],
          verdict,
          reason: typeof session['reason'] === 'string' ? session['reason'] : '',
          approved: session['approved'] === true,
          moments: Array.isArray(change?.['moments']) ? change['moments'].filter((moment): moment is number => typeof moment === 'number') : [],
        }];
      }),
    } };
  },
};

/** The answer to an approval that went through (a refusal is an error status): which session. */
export const sessionsCheckApprovalDecoder = {
  decode(input: unknown): Readonly<{ sessionId: string }> | undefined {
    return isRecord(input) && input['approved'] === true && typeof input['sessionId'] === 'string'
      ? { sessionId: input['sessionId'] }
      : undefined;
  },
};

export type SessionsCheckRow = Readonly<{
  sessionId: string;
  title: string;
  label: string;
  tone: 'danger' | 'warning' | 'important' | undefined;
  reason: string;
  /** A change nobody approved yet: the only thing a person can approve. */
  approvable: boolean;
}>;

export type SessionsCheckView = Readonly<{
  /** Nothing checked yet, or the archive cannot say. */
  none: boolean;
  builds: string;
  verdictLine: string;
  tone: 'danger' | 'important' | undefined;
  /** The sessions to look at: every one but the unchanged. */
  rows: readonly SessionsCheckRow[];
}>;

const VERDICT_ORDER: readonly SessionsCheckVerdict[] = VERDICTS;

function verdictLabel(session: SessionsCheckSession): Readonly<{ label: string; tone: SessionsCheckRow['tone'] }> {
  if (session.approved) return { label: i18n.t('suiteCheckApproved'), tone: 'important' };
  switch (session.verdict) {
    case 'regression':
      return { label: i18n.t('suiteCheckRegression'), tone: 'danger' };
    case 'changed':
      return { label: i18n.t('suiteCheckChanged'), tone: 'warning' };
    case 'flaky':
      return { label: i18n.t('suiteCheckFlaky'), tone: 'warning' };
    case 'stale':
      return { label: i18n.t('suiteCheckStale'), tone: undefined };
    case 'unchanged':
      return { label: i18n.t('suiteCheckUnchanged'), tone: 'important' };
  }
}

export function sessionsCheckView(answer: SessionsCheckAnswer | undefined): SessionsCheckView {
  const check = answer?.check;
  if (!check) return { none: true, builds: '', verdictLine: '', tone: undefined, rows: [] };
  const counts = new Map<string, number>();
  for (const session of check.sessions) {
    const { label } = verdictLabel(session);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const sorted = [...check.sessions].sort(
    (left, right) =>
      Number(left.approved) - Number(right.approved) || VERDICT_ORDER.indexOf(left.verdict) - VERDICT_ORDER.indexOf(right.verdict),
  );
  return {
    none: false,
    builds: i18n.t('suiteCheckBuilds', { name: check.base, detail: check.head }),
    verdictLine: [
      [...counts].map(([label, count]) => `${label} ${count}`).join(' · '),
      check.passed ? i18n.t('suiteCheckPassed') : i18n.t('suiteCheckFailed'),
    ].filter(Boolean).join(' — '),
    tone: check.passed ? 'important' : 'danger',
    rows: sorted
      .filter((session) => session.verdict !== 'unchanged')
      .map((session) => ({
        sessionId: session.sessionId,
        title: session.sessionId.slice(0, 8),
        ...verdictLabel(session),
        reason: session.moments.length
          ? i18n.t('suiteCheckMoments', { detail: session.reason, name: session.moments.join(', ') })
          : session.reason,
        approvable: session.verdict === 'changed' && !session.approved,
      })),
  };
}
