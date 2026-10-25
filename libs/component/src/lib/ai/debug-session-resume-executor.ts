export type ResumeCallDecision = 'live' | 'live+patch' | 'recorded' | 'held';
export type ResumeFidelityClass =
  | 'real'
  | 'assisted'
  | 'partially-simulated'
  | 'refused';
export type ResumeStepStatus =
  | 'conformant'
  | 'tolerated'
  | 'recorded'
  | 'blocked';

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
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly detail?: string;
}

export interface ResumeFidelityReport {
  readonly classification: ResumeFidelityClass;
  readonly steps: readonly ResumeStepResult[];
  readonly overrides: readonly ResumeOverride[];
  readonly blocked: readonly string[];
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
  executeStep(
    step: import('./debug-session-resume-plan').DebugSessionResumeStep,
  ): Promise<ResumeStepResult>;
  cleanup?(): Promise<void> | void;
  onStep?(result: ResumeStepResult, index: number): void;
}

/** Decision for a single outbound call while the resume barrier is active. */
export function decideResumeCall(
  call: string,
  options: Readonly<{
    allowedCalls: ReadonlySet<string>;
    override?: ResumeOverride;
    readOnly?: boolean;
    unattended?: boolean;
  }>,
): ResumeCallDecision {
  if (options.override) return 'live+patch';
  if (options.allowedCalls.has(call)) return 'live';
  if (options.readOnly) return 'recorded';
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
  if (steps.some((step) => step.status === 'tolerated') || overrides.length > 0)
    return 'assisted';
  return 'real';
}

export function createResumeFidelityReport(
  steps: readonly ResumeStepResult[],
  overrides: readonly ResumeOverride[] = [],
): ResumeFidelityReport {
  const blocked = steps
    .filter((step) => step.status === 'blocked')
    .map((step) => step.detail ?? step.id);
  return {
    classification: classifyResumeFidelity(steps, overrides),
    steps: [...steps],
    overrides: [...overrides],
    blocked,
  };
}

/** Runs planned operations serially, and never begins without a passed preflight. */
export async function executeDebugSessionResumePlan(
  plan: import('./debug-session-resume-plan').DebugSessionResumePlan,
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
      {
        id: 'preflight',
        status: 'blocked',
        detail: error instanceof Error ? error.message : String(error),
      },
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
  for (const [index, step] of plan.steps.entries()) {
    let result: ResumeStepResult;
    try {
      const executed = await adapter.executeStep(step);
      result = { ...executed, id: step.id };
    } catch (error) {
      result = {
        id: step.id,
        status: 'blocked',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    if (result.status === 'blocked' && !step.blocking) {
      result = {
        ...result,
        status: 'tolerated',
        detail: result.detail ?? 'Étape non bloquante omise.',
      };
    }
    results.push(result);
    adapter.onStep?.(result, index);
    if (result.status !== 'blocked') continue;
    for (const dependent of plan.steps.slice(index + 1)) {
      results.push({
        id: dependent.id,
        status: 'blocked',
        detail: `Non tentée : l’étape '${step.id}' a échoué.`,
      });
    }
    try {
      await adapter.cleanup?.();
    } catch (cleanupError) {
      results.push({
        id: 'cleanup',
        status: 'blocked',
        detail:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      });
    }
    break;
  }
  return report(results);
}
