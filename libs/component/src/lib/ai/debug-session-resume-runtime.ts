import {
  ɵinjectCraftPrimitiveRegistry,
  ɵinjectCraftTemporalRuntime,
  executeGeneratorCompatibleFactoryAsync,
  type CraftPrimitiveEntry,
  type CraftResumePersona,
  type CraftPrimitiveSnapshot,
} from '@craft-ts/core';
import type { Injector } from '../host-runtime';
import type { DebugAppSnapshot } from './debug-session-app-snapshot';
import {
  executeDebugSessionResumePlan,
  isTechnicalFailure,
  ResumeTechnicalError,
  type DebugSessionResumeExecutionAdapter,
  type ResumeFidelityReport,
  type ResumeStepResult,
} from './debug-session-resume-executor';
import type { DebugSessionResumeManifest } from './debug-session-resume-manifest';
import type {
  DebugSessionResumePlan,
  DebugSessionResumeStep,
  RecordedResumeIdentity,
} from './debug-session-resume-plan';
import { readResumePathValue } from './debug-session-resume-path';
import {
  runDebugSessionResumePreflight,
  type ResumePreflightAdapter,
} from './debug-session-resume-preflight';

export interface ExecuteCraftSessionResumeOptions {
  readonly plan: DebugSessionResumePlan;
  readonly manifest: DebugSessionResumeManifest;
  readonly snapshot: DebugAppSnapshot;
  readonly injector: Injector;
  readonly registry?: ReturnType<typeof ɵinjectCraftPrimitiveRegistry>;
  readonly personas: readonly CraftResumePersona[];
  readonly preflightAdapter: ResumePreflightAdapter;
  /** Narrows the transport barrier to the calls declared for each step. */
  readonly setAllowedCalls?: (calls: ReadonlySet<string>) => void;
  readonly onStep?: (result: ResumeStepResult, index: number) => void;
  readonly taskWasScheduled?: (index: number) => boolean;
  /** In-memory values acquired by the leader tab earlier in this run. */
  readonly sharedResources?: Map<string, unknown>;
  readonly onResourceAcquired?: (resource: string, value: unknown) => void;
  /** Whether the app already sent these calls again with a reacquired resource. */
  readonly callsWereReread?: (calls: readonly string[]) => boolean;
}

export type CraftSessionResumeExecution = ResumeFidelityReport &
  Readonly<{ release(): Promise<void> }>;

/**
 * Executes declared adapters in the target app's injector. The serialized plan
 * carries only operation ids; credentials and executable callbacks stay local.
 */
export async function executeCraftSessionResume(
  options: ExecuteCraftSessionResumeOptions,
): Promise<CraftSessionResumeExecution> {
  const registry = options.registry ?? ɵinjectCraftPrimitiveRegistry();
  const resourceValues = options.sharedResources ?? new Map<string, unknown>();
  const normalizeAddress = (address: string) =>
    address
      .split(' / ')
      .map((part) => part.replace(/#\d+$/, ''))
      .join(' / ');
  const byAddress = (address: string | undefined) => {
    if (!address) return undefined;
    const exact = registry.list().filter((entry) => entry.address === address);
    if (exact.length === 1) return exact[0];
    const normalizedAddress = normalizeAddress(address);
    const matches = registry
      .list()
      .filter((entry) => normalizeAddress(entry.address) === normalizedAddress);
    return matches.length === 1 ? matches[0] : undefined;
  };
  const runCallback = async (callback: () => unknown): Promise<unknown> => {
    const settled = await executeGeneratorCompatibleFactoryAsync({
      factory: callback,
      thisArg: undefined,
      getInjector: () => options.injector,
      args: [],
      invalidYieldErrorMessage: 'invalid Craft resume adapter yield',
      appStartNotSupportedErrorMessage:
        'Craft resume adapters cannot start a second app initializer.',
    });
    if (settled.kind === 'shortCircuit') {
      const failure = new Error(String(settled.exception));
      throw isTechnicalFailure(settled.exception)
        ? new ResumeTechnicalError(failure.message)
        : failure;
    }
    return settled.value;
  };
  const withCalls = async <T>(
    calls: readonly string[] | undefined,
    run: () => Promise<T>,
  ): Promise<T> => {
    options.setAllowedCalls?.(new Set(calls ?? []));
    try {
      return await run();
    } finally {
      options.setAllowedCalls?.(new Set());
    }
  };
  /** Runs a successful acquisition's declared cleanup (sign out, delete). */
  const releaseStep = async (step: DebugSessionResumeStep) => {
    const declaration = byAddress(step.primitive)?.resume;
    if (!declaration?.cleanup) return;
    await withCalls(step.allowedCalls, () =>
      runCallback(() => declaration.cleanup!()),
    );
    if (step.resource) resourceValues.delete(step.resource);
  };
  const adapter: DebugSessionResumeExecutionAdapter = {
    preflight: async () => {
      const result = await runDebugSessionResumePreflight(
        options.manifest,
        options.preflightAdapter,
      );
      return { status: result.status, missing: result.missing };
    },
    executeStep: async (step) => {
      if (step.unneeded)
        return {
          id: step.id,
          status: 'conformant',
          detail: step.reason ?? 'Non nécessaire au point ciblé.',
        };
      return withCalls(step.allowedCalls, () => executeStep(step));
    },
    releaseStep,
    cleanup: () => options.setAllowedCalls?.(new Set()),
    sleep: (delayMs) =>
      ɵinjectCraftTemporalRuntime().sleep(delayMs, { owner: 'resume-retry' }),
    onStep: options.onStep,
  };
  const report = await executeDebugSessionResumePlan(options.plan, adapter);
  return {
    ...report,
    // An expectation that fails after the user took over (`abort`) undoes
    // the acquisitions too, in reverse order.
    release: async () => {
      const done = new Set(
        report.steps
          .filter(
            (result) =>
              result.status === 'conformant' || result.status === 'overridden',
          )
          .map((result) => result.id),
      );
      for (const step of [...options.plan.steps].reverse())
        if (step.kind === 'acquire' && !step.unneeded && done.has(step.id))
          await releaseStep(step);
    },
  };

  async function executeStep(
    step: DebugSessionResumeStep,
  ): Promise<ResumeStepResult> {
    if (step.kind === 'rearm-task') {
      if (
        step.taskIndex !== undefined &&
        options.taskWasScheduled?.(step.taskIndex)
      )
        return {
          id: step.id,
          status: 'conformant',
          detail: 'Tâche recréée par son propriétaire avec son délai restant.',
        };
      return {
        id: step.id,
        status: step.blocking ? 'blocked' : 'skipped',
        detail:
          step.reason ??
          'La tâche n’a pas été recréée au démarrage par son propriétaire.',
      };
    }
    const entry = byAddress(step.primitive);
    const declaration = entry?.resume;
    if (!entry || !declaration)
      throw new Error(`Déclaration absente pour ${step.primitive ?? step.id}.`);

    switch (step.kind) {
      case 'acquire': {
        if (step.resource && resourceValues.has(step.resource))
          return {
            id: step.id,
            status: 'conformant',
            detail: 'Ressource reçue de l’onglet de tête.',
          };
        if (!declaration.acquire || !step.persona)
          throw new Error(`Aucun adaptateur local pour ${step.id}.`);
        const persona =
          options.personas.find(
            (candidate) =>
              candidate.role === step.persona &&
              (step.personaId === undefined || candidate.id === step.personaId),
          ) ??
          options.personas.find(
            (candidate) =>
              candidate.role === step.persona && candidate.id === undefined,
          );
        if (!persona)
          throw new Error(`Persona '${step.persona}' indisponible.`);
        const result = await runCallback(() => declaration.acquire!(persona));
        if (entry.status?.() === 'exception')
          throw new Error(`L’acquisition '${step.resource}' a échoué.`);
        const value = result === undefined ? safeRead(entry) : result;
        if (value === undefined)
          throw new Error(`L’acquisition '${step.resource}' n’a fourni aucune ressource.`);
        // The acquired value already says who it belongs to when a holder
        // declares identity paths; the server's answer is checked again by
        // the refetch of the `requires` primitive.
        const holder = registry
          .list()
          .find(
            (candidate) =>
              candidate.resume?.resource === step.resource &&
              candidate.resume?.role === 'holds' &&
              candidate.resume?.identity !== undefined,
          );
        const mismatch =
          step.expectedIdentity && holder?.resume
            ? identityMismatchOf(
                { ...holder, read: () => value },
                holder.resume,
                step.expectedIdentity,
              )
            : undefined;
        if (mismatch)
          return {
            id: step.id,
            status: 'blocked',
            code: 'identity-mismatch',
            expected: step.expectedIdentity,
            actual: mismatch.actual,
            detail: mismatch.detail,
          };
        if (step.resource) {
          resourceValues.set(step.resource, value);
          options.onResourceAcquired?.(step.resource, value);
        }
        return {
          id: step.id,
          status: step.assisted ? 'overridden' : 'conformant',
          detail: step.assisted
            ? `Ressource acquise avec une autre persona (${step.persona}) : reprise assistée.`
            : 'Ressource acquise dans l’application cible.',
        };
      }
      case 'substitute': {
        if (!declaration.write)
          throw new Error(`Aucun adaptateur de substitution pour ${step.id}.`);
        const value = step.resource
          ? (resourceValues.get(step.resource) ??
            readResourceProvider(step.resource))
          : undefined;
        if (value === undefined)
          throw new Error(
            `La ressource '${step.resource}' n’a pas été acquise.`,
          );
        await runCallback(() => declaration.write!(value));
        return {
          id: step.id,
          status: 'conformant',
          detail: 'État substitué dans l’application cible.',
        };
      }
      case 'restore': {
        if (!declaration.write)
          throw new Error(`Aucun adaptateur de restauration pour ${step.id}.`);
        if (
          !step.primitive ||
          (!hasOwn(options.snapshot.primitives, step.primitive) &&
            declaration.value === undefined)
        )
          throw new Error(`Snapshot absent pour ${step.primitive ?? step.id}.`);
        const value = hasOwn(options.snapshot.primitives, step.primitive)
          ? options.snapshot.primitives[step.primitive]
          : declaration.value;
        await runCallback(() => declaration.write!(value));
        return {
          id: step.id,
          status: 'conformant',
          detail: 'Instantané restauré dans l’application cible.',
        };
      }
      case 'refetch': {
        const previousStatus = entry.status?.();
        const previousError = entry.error?.();
        // A load already running (held, then sent with the new resource)
        // is the re-read: waiting for it avoids a second request.
        const running =
          previousStatus === 'loading' || previousStatus === 'reloading';
        const reread =
          !running &&
          previousStatus !== 'exception' &&
          options.callsWereReread?.(step.allowedCalls ?? []) === true;
        if (!running && !reread && !entry.reload?.())
          throw new Error(
            `La primitive '${entry.address}' ne peut pas être relue.`,
          );
        if (!reread)
          await waitForSettled(
            registry,
            entry.address,
            previousStatus,
            previousError,
            running,
          );
        if (entry.status?.() === 'exception') {
          const message = `La relecture '${entry.name}' a échoué.`;
          throw isTechnicalFailure(entry.error?.())
            ? new ResumeTechnicalError(message)
            : new Error(message);
        }
        const mismatch = step.expectedIdentity
          ? identityMismatchOf(entry, declaration, step.expectedIdentity)
          : undefined;
        if (mismatch)
          return {
            id: step.id,
            status: 'blocked',
            code: 'identity-mismatch',
            expected: step.expectedIdentity,
            actual: mismatch.actual,
            detail: mismatch.detail,
          };
        return {
          id: step.id,
          status: 'conformant',
          detail: step.expectedIdentity
            ? `Donnée relue depuis le serveur · identité ${step.expectedIdentity.role}${step.expectedIdentity.id ? ` · ${step.expectedIdentity.id}` : ''} confirmée.`
            : 'Donnée relue depuis le serveur.',
        };
      }
    }
  }

  function readResourceProvider(resource: string): unknown {
    const provider = registry
      .list()
      .find(
        (candidate) =>
          candidate.resume?.resource === resource &&
          candidate.resume.role === 'provides',
      );
    return provider ? safeRead(provider) : undefined;
  }
}

/** Compares the identity the server now reports with the recorded one. */
function identityMismatchOf(
  entry: CraftPrimitiveEntry,
  declaration: NonNullable<CraftPrimitiveEntry['resume']>,
  expected: RecordedResumeIdentity,
): Readonly<{ actual: unknown; detail: string }> | undefined {
  const identity = declaration.identity;
  if (!identity) return undefined;
  const value = safeRead(entry);
  const role = readResumePathValue(value, identity.role);
  const id =
    identity.id === undefined ? undefined : readResumePathValue(value, identity.id);
  const actual = {
    role: typeof role === 'string' ? role : undefined,
    ...(id === undefined ? {} : { id: String(id) }),
  };
  if (
    actual.role === expected.role &&
    (expected.id === undefined || actual.id === expected.id)
  )
    return undefined;
  return {
    actual,
    detail: `Identité différente de l’enregistrement : attendu ${expected.role}${expected.id ? ` · ${expected.id}` : ''}, obtenu ${actual.role ?? 'aucune'}${actual.id ? ` · ${actual.id}` : ''}.`,
  };
}

async function waitForSettled(
  registry: NonNullable<ExecuteCraftSessionResumeOptions['registry']>,
  address: string,
  previousStatus?: string,
  previousError?: unknown,
  alreadyRunning = false,
): Promise<void> {
  const runtime = ɵinjectCraftTemporalRuntime();
  const deadline = runtime.now() + 15_000;
  let observedRunning = alreadyRunning;
  while (runtime.now() < deadline) {
    const entry = registry.get(address);
    const status = entry?.status?.();
    const error = entry?.error?.();
    if (status === 'loading' || status === 'reloading') {
      observedRunning = true;
    } else if (
      observedRunning ||
      status !== previousStatus ||
      error !== previousError
    ) {
      return;
    }
    await runtime.sleep(25, { owner: 'resume-refetch-wait' });
  }
  throw new Error(`Délai dépassé en attendant la relecture de ${address}.`);
}

function safeRead(entry: CraftPrimitiveEntry): unknown {
  try {
    return entry.read();
  } catch {
    return undefined;
  }
}

function hasOwn(value: CraftPrimitiveSnapshot, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
