import type {
  DebugSessionResumePlan,
  DebugSessionResumeStep,
} from './debug-session-resume-plan';

export type ResumeCallDecision = 'live' | 'live+patch' | 'held' | 'blocked';
export type ResumeFidelityClass =
  | 'real'
  | 'assisted'
  | 'partially-simulated'
  | 'refused';
/**
 * `drifted`: a tolerated difference with the recording. `skipped`: a
 * non-blocking step that failed. `overridden`: a person decided instead of
 * the recording (an override, a held call let through, another persona).
 */
export type ResumeStepStatus =
  | 'conformant'
  | 'drifted'
  | 'skipped'
  | 'overridden'
  | 'recorded'
  | 'blocked';

export const RESUME_STEP_STATUSES: readonly ResumeStepStatus[] = [
  'conformant',
  'drifted',
  'skipped',
  'overridden',
  'recorded',
  'blocked',
];

export const RESUME_FIDELITY_LABELS: Readonly<
  Record<ResumeFidelityClass, string>
> = {
  real: 'réelle',
  assisted: 'assistée',
  'partially-simulated': 'partiellement simulée',
  refused: 'refusée',
};

export interface ResumeOverride {
  readonly call: string;
  readonly patch?: unknown;
  readonly response?: unknown;
  /** Optional HTTP status override for a replaced or patched JSON response. */
  readonly status?: number;
  readonly frozen?: boolean;
  readonly assistedBy?: 'human' | 'ai';
}

export interface ResumeStepResult {
  readonly id: string;
  readonly status: ResumeStepStatus;
  /** Machine-readable reason of a blocked step (`identity-mismatch`…). */
  readonly code?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly detail?: string;
  /** A technical failure (network, 5xx): the executor tries again. */
  readonly retryable?: boolean;
}

export interface ResumeFidelityReport {
  readonly classification: ResumeFidelityClass;
  readonly steps: readonly ResumeStepResult[];
  readonly overrides: readonly ResumeOverride[];
  readonly blocked: readonly string[];
  /** Tolerated drifts and skipped steps: they do not lower the class. */
  readonly warnings: readonly string[];
}

export interface DebugSessionResumeExecutionAdapter {
  /** Must finish before the first side effect; this port should be read-only. */
  preflight(): Promise<
    Readonly<{
      status: 'passed' | 'failed';
      missing: readonly Readonly<{
        kind: string;
        name: string;
        detail?: string;
      }>[];
    }>
  >;
  executeStep(step: DebugSessionResumeStep): Promise<ResumeStepResult>;
  /** Undoes a successful acquisition when the resume is abandoned. */
  releaseStep?(step: DebugSessionResumeStep): Promise<void> | void;
  cleanup?(): Promise<void> | void;
  onStep?(result: ResumeStepResult, index: number): void;
  /** Waits between retries; the temporal runtime freezes it with the clock. */
  sleep?(delayMs: number): Promise<void>;
}

/** A failure worth retrying: the network or the server, not the request. */
export class ResumeTechnicalError extends Error {
  readonly retryable = true;
}

/** Delays before the second and third attempts of a technical failure. */
export const RESUME_RETRY_DELAYS_MS: readonly number[] = [250, 1_000];

/** The single decision point for an outbound call while the barrier is active. */
export function decideResumeCall(
  call: string,
  options: Readonly<{
    allowedCalls: ReadonlySet<string>;
    override?: ResumeOverride;
    readOnly?: boolean;
    /** Nobody can answer a held call: refuse it at once. */
    unattended?: boolean;
  }>,
): ResumeCallDecision {
  if (options.override) return 'live+patch';
  if (options.allowedCalls.has(call) || options.readOnly) return 'live';
  if (options.unattended) return 'blocked';
  return 'held';
}

/** Never promotes a run beyond the least-real step that occurred. */
export function classifyResumeFidelity(
  steps: readonly ResumeStepResult[],
  overrides: readonly ResumeOverride[] = [],
): ResumeFidelityClass {
  if (steps.some((step) => step.status === 'blocked')) return 'refused';
  if (steps.some((step) => step.status === 'recorded'))
    return 'partially-simulated';
  if (steps.some((step) => step.status === 'overridden') || overrides.length)
    return 'assisted';
  return 'real';
}

export function createResumeFidelityReport(
  steps: readonly ResumeStepResult[],
  overrides: readonly ResumeOverride[] = [],
): ResumeFidelityReport {
  return {
    classification: classifyResumeFidelity(steps, overrides),
    steps: [...steps],
    overrides: [...overrides],
    blocked: steps
      .filter((step) => step.status === 'blocked')
      .map((step) => step.detail ?? step.id),
    warnings: steps
      .filter((step) => step.status === 'drifted' || step.status === 'skipped')
      .map((step) => `${step.id} · ${step.detail ?? step.status}`),
  };
}

/**
 * Runs planned operations in order, never before a passed preflight. A
 * failure only stops the steps that depend on it; when anything is blocked,
 * the acquisitions that succeeded are released in reverse order.
 */
export async function executeDebugSessionResumePlan(
  plan: DebugSessionResumePlan,
  adapter: DebugSessionResumeExecutionAdapter,
  overrides: readonly ResumeOverride[] = [],
): Promise<ResumeFidelityReport> {
  const report = (steps: readonly ResumeStepResult[]) =>
    createResumeFidelityReport(steps, overrides);
  if (plan.status !== 'ready') {
    return report(
      plan.problems
        .filter((problem) => problem.blocking)
        .map((problem, index) => ({
          id: `plan:${problem.code}:${index}`,
          status: 'blocked' as const,
          code: problem.code,
          detail: problem.message,
        })),
    );
  }

  let preflight: Awaited<
    ReturnType<DebugSessionResumeExecutionAdapter['preflight']>
  >;
  try {
    preflight = await adapter.preflight();
  } catch (error) {
    return report([
      { id: 'preflight', status: 'blocked', detail: messageOf(error) },
    ]);
  }
  if (preflight.status !== 'passed') {
    return report([
      {
        id: 'preflight',
        status: 'blocked',
        detail: preflight.missing.length
          ? `Pré-vol refusé : ${preflight.missing.map((fact) => `${fact.kind} ${fact.name}`).join(', ')}.`
          : 'Pré-vol refusé par l’adaptateur backend.',
      },
    ]);
  }

  // Non-blocking plan diagnostics remain visible in the prepared plan but do
  // not describe execution drift. They must not lower runtime fidelity.
  const results: ResumeStepResult[] = [];
  const failed = new Set<string>();
  const acquired: DebugSessionResumeStep[] = [];
  for (const [index, step] of plan.steps.entries()) {
    const failedDependency = step.dependsOn?.find((id) => failed.has(id));
    let result: ResumeStepResult = failedDependency
      ? {
          id: step.id,
          status: step.blocking ? 'blocked' : 'skipped',
          detail: `Non tentée : l’étape '${failedDependency}' a échoué.`,
        }
      : await runWithRetry(step, adapter);
    if (result.status === 'blocked' && !step.blocking)
      result = {
        ...result,
        status: 'skipped',
        detail: result.detail ?? 'Étape non bloquante omise.',
      };
    if (result.status === 'blocked' || result.status === 'skipped')
      failed.add(step.id);
    else if (step.kind === 'acquire' && !step.unneeded) acquired.push(step);
    results.push(result);
    adapter.onStep?.(result, index);
  }

  if (results.some((result) => result.status === 'blocked')) {
    for (const step of [...acquired].reverse()) {
      try {
        await adapter.releaseStep?.(step);
      } catch (error) {
        results.push({
          id: `cleanup:${step.id}`,
          status: 'skipped',
          detail: `Nettoyage impossible : ${messageOf(error)}`,
        });
      }
    }
    try {
      await adapter.cleanup?.();
    } catch (error) {
      results.push({
        id: 'cleanup',
        status: 'skipped',
        detail: `Nettoyage impossible : ${messageOf(error)}`,
      });
    }
  }
  return report(results);
}

async function runWithRetry(
  step: DebugSessionResumeStep,
  adapter: DebugSessionResumeExecutionAdapter,
): Promise<ResumeStepResult> {
  for (let attempt = 0; ; attempt += 1) {
    let result: ResumeStepResult;
    let retryable: boolean;
    try {
      result = { ...(await adapter.executeStep(step)), id: step.id };
      retryable = result.status === 'blocked' && result.retryable === true;
    } catch (error) {
      result = { id: step.id, status: 'blocked', detail: messageOf(error) };
      retryable = isTechnicalFailure(error);
    }
    const delay = RESUME_RETRY_DELAYS_MS[attempt];
    if (!retryable || delay === undefined) {
      const { retryable: _retryable, ...settled } = result;
      return attempt > 0
        ? {
            ...settled,
            detail: `${settled.detail ?? ''} (${attempt + 1} tentatives)`.trim(),
          }
        : settled;
    }
    await (adapter.sleep?.(delay) ?? Promise.resolve());
  }
}

/** Network failures surface as `TypeError` from fetch; servers as 5xx. */
export function isTechnicalFailure(error: unknown): boolean {
  if (error instanceof ResumeTechnicalError || error instanceof TypeError)
    return true;
  if (typeof error !== 'object' || error === null) return false;
  const record = error as Record<string, unknown>;
  const status = record['status'] ?? record['statusCode'];
  return (
    record['retryable'] === true || (typeof status === 'number' && status >= 500)
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
