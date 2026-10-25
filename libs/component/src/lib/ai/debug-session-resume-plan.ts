import type {
  CraftResumeDeclaration,
  CraftResumePersona,
  SendContextReplayExport,
} from '@craft-ts/core';
import { supportsDebugSessionResume } from './debug-session-format';

export interface ResumeGraphArtifact {
  readonly format: 'craft-resume-graph';
  readonly version: 1;
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly nodes: readonly Readonly<{
    id: string;
    kind: string;
    label: string;
    sourceHash?: string;
    details?: Readonly<Record<string, unknown>>;
  }>[];
  readonly edges: readonly Readonly<{
    from: string;
    to: string;
    kind: string;
  }>[];
}

export type DebugSessionResumeStepKind =
  | 'acquire'
  | 'substitute'
  | 'restore'
  | 'refetch'
  | 'rearm-task';

export interface DebugSessionResumeStep {
  readonly id: string;
  /** Present on dashboard-only plans that combine several archived tabs. */
  readonly participantId?: string;
  readonly kind: DebugSessionResumeStepKind;
  readonly resource?: string;
  readonly primitive?: string;
  readonly persona?: string;
  readonly identity?: boolean;
  readonly blocking: boolean;
  readonly delayMs?: number;
  readonly taskIndex?: number;
  readonly taskKind?: string;
  readonly allowedCalls?: readonly string[];
  readonly reason?: string;
}

export interface DebugSessionResumePlan {
  readonly format: 'craft-debug-session-resume-plan';
  readonly version: 1;
  readonly targetElapsedMs: number;
  /** Present on a dashboard preview that combines several participants. */
  readonly participantIds?: readonly string[];
  readonly clockPolicy?: 'real' | 'recorded';
  readonly status: 'ready' | 'refused';
  readonly steps: readonly DebugSessionResumeStep[];
  readonly problems: readonly Readonly<{
    code: string;
    message: string;
    blocking: boolean;
  }>[];
  readonly expectedCalls: readonly string[];
  /** Declared outcomes found in the archive, including calls after the target. */
  readonly expectedOutcomes?: readonly Readonly<{
    readonly call: string;
    readonly outcome: 'recorded';
    readonly match?: readonly (readonly (string | number)[])[];
    readonly status?: number;
  }> [];
  readonly substitutions: readonly Readonly<{
    resource: string;
    fingerprint: string;
    placeholder: string;
    path: string;
  }>[];
}

export function isDebugSessionResumePlan(
  value: unknown,
): value is DebugSessionResumePlan {
  if (!isRecord(value)) return false;
  const record = value;
  const stepsValue = record['steps'];
  if (
    record['format'] !== 'craft-debug-session-resume-plan' ||
    record['version'] !== 1 ||
    !Number.isFinite(record['targetElapsedMs']) ||
    (record['participantIds'] !== undefined &&
      (!Array.isArray(record['participantIds']) ||
        !record['participantIds'].every((id) => typeof id === 'string'))) ||
    (record['status'] !== 'ready' && record['status'] !== 'refused') ||
    (record['clockPolicy'] !== undefined &&
      record['clockPolicy'] !== 'real' &&
      record['clockPolicy'] !== 'recorded') ||
    !Array.isArray(stepsValue) ||
    !Array.isArray(record['problems']) ||
    !Array.isArray(record['expectedCalls']) ||
    (record['expectedOutcomes'] !== undefined &&
      (!Array.isArray(record['expectedOutcomes']) ||
        !record['expectedOutcomes'].every(
          (outcome) =>
            isRecord(outcome) &&
            typeof outcome['call'] === 'string' &&
            outcome['outcome'] === 'recorded' &&
            (outcome['status'] === undefined ||
              (Number.isInteger(outcome['status']) &&
                Number(outcome['status']) >= 100 &&
                Number(outcome['status']) <= 599)),
        ))),
    !Array.isArray(record['substitutions'])
  )
    return false;
  return (stepsValue as unknown[]).every(
    (step) =>
      isRecord(step) &&
      typeof step['id'] === 'string' &&
      (step['participantId'] === undefined ||
        typeof step['participantId'] === 'string') &&
      ['acquire', 'substitute', 'restore', 'refetch', 'rearm-task'].includes(
        String(step['kind']),
      ) &&
      typeof step['blocking'] === 'boolean' &&
      (step['taskIndex'] === undefined ||
        Number.isSafeInteger(step['taskIndex'])) &&
      (step['taskKind'] === undefined ||
        typeof step['taskKind'] === 'string') &&
      (step['allowedCalls'] === undefined ||
        (Array.isArray(step['allowedCalls']) &&
          step['allowedCalls'].every((call) => typeof call === 'string'))),
  );
}

export interface BuildDebugSessionResumePlanOptions {
  readonly archive: SendContextReplayExport;
  readonly targetElapsedMs: number;
  readonly graph: ResumeGraphArtifact;
  readonly declarations: Readonly<Record<string, CraftResumeDeclaration>>;
  readonly personas?: readonly CraftResumePersona[];
  /** Hashes captured with the archive, keyed by primitive address. */
  readonly sourceHashes?: Readonly<Record<string, string>>;
  readonly clockPolicy?: 'real' | 'recorded';
}

/** Combines tab-local plans into the dashboard's session-wide preview. */
export function combineDebugSessionResumePlans(options: {
  readonly participantIds: readonly string[];
  readonly targetElapsedMs: number;
  readonly clockPolicy: 'real' | 'recorded';
  readonly plans: readonly Readonly<{
    participantId: string;
    plan: DebugSessionResumePlan;
  }>[];
  readonly failures?: readonly Readonly<{
    participantId: string;
    message: string;
  }>[];
}): DebugSessionResumePlan {
  const failures = options.failures ?? [];
  return {
    format: 'craft-debug-session-resume-plan',
    version: 1,
    targetElapsedMs: options.targetElapsedMs,
    participantIds: [...options.participantIds],
    clockPolicy: options.clockPolicy,
    status:
      failures.length === 0 &&
      options.plans.length === options.participantIds.length &&
      options.plans.every(({ plan }) => plan.status === 'ready')
        ? 'ready'
        : 'refused',
    steps: options.plans.flatMap(({ participantId, plan }) =>
      plan.steps.map((step) => ({
        ...step,
        id: `${participantId}:${step.id}`,
        participantId,
      })),
    ),
    problems: [
      ...failures.map(({ participantId, message }) => ({
        code: 'participant-plan-unavailable',
        message: `${participantId} · ${message}`,
        blocking: true,
      })),
      ...options.plans.flatMap(({ participantId, plan }) =>
        plan.problems.map((problem) => ({
          ...problem,
          message: `${participantId} · ${problem.message}`,
        })),
      ),
    ],
    expectedCalls: [
      ...new Set(options.plans.flatMap(({ plan }) => plan.expectedCalls)),
    ],
    expectedOutcomes: [
      ...new Map(
        options.plans
          .flatMap(({ plan }) => plan.expectedOutcomes ?? [])
          .map((outcome) => [outcome.call, outcome] as const),
      ).values(),
    ],
    substitutions: options.plans.flatMap(({ plan }) => plan.substitutions),
  };
}

/**
 * Produces a serializable, read-only execution proposal. It never invokes an
 * application callback or performs network/storage work.
 */
export function buildDebugSessionResumePlan(
  options: BuildDebugSessionResumePlanOptions,
): DebugSessionResumePlan {
  const problems: DebugSessionResumePlan['problems'][number][] = [];
  const steps: DebugSessionResumeStep[] = [];
  if (
    !Number.isFinite(options.targetElapsedMs) ||
    options.targetElapsedMs < 0
  ) {
    problems.push({
      code: 'invalid-target',
      message: 'Le point ciblé doit être un temps écoulé positif.',
      blocking: true,
    });
  }
  if (!supportsDebugSessionResume(options.archive)) {
    problems.push({
      code: 'archive-without-provenance',
      message:
        'Cette archive ne contient pas la provenance requise pour une reprise.',
      blocking: true,
    });
  }

  const graphIds = new Set(options.graph.nodes.map((node) => node.id));
  if (graphIds.size === 0 || Object.keys(options.declarations).length === 0) {
    problems.push({
      code: 'resume-declarations-unavailable',
      message:
        'L’application ne fournit aucune déclaration de reprise exploitable.',
      blocking: true,
    });
  }
  if (
    graphIds.size > 0 &&
    Object.keys(options.declarations).some(
      (address) =>
        !options.graph.sourceHashes[address] ||
        !options.sourceHashes?.[address],
    )
  ) {
    problems.push({
      code: 'source-hashes-unavailable',
      message:
        'Les empreintes source de l’archive ou du graphe courant manquent : les changements de code ne peuvent pas être détectés.',
      blocking: false,
    });
  }
  const availableResources = new Set(
    Object.values(options.declarations)
      .filter(
        (declaration) =>
          declaration.role === 'provides' || declaration.role === 'holds',
      )
      .map((declaration) => declaration.resource),
  );
  const substitutions: DebugSessionResumePlan['substitutions'][number][] = [];
  for (const [primitive, declaration] of Object.entries(options.declarations)) {
    if (!graphIds.has(primitive)) {
      problems.push({
        code: 'primitive-missing',
        message: `La primitive déclarée '${primitive}' est absente du graphe de reprise.`,
        blocking: true,
      });
      continue;
    }
    if (options.sourceHashes) {
      const current = options.graph.sourceHashes[primitive];
      const recorded = options.sourceHashes[primitive];
      if (current && recorded && current !== recorded) {
        problems.push({
          code: 'source-drift',
          message: `La source de '${primitive}' a changé depuis la génération du graphe.`,
          blocking: true,
        });
      }
    }
    if (declaration.role === 'provides') {
      const persona = declaration.persona;
      const available =
        persona && options.personas?.some((item) => item.role === persona);
      steps.push({
        id: `acquire:${primitive}:${declaration.resource}`,
        kind: 'acquire',
        primitive,
        resource: declaration.resource,
        ...(persona ? { persona } : {}),
        ...(declaration.calls ? { allowedCalls: declaration.calls } : {}),
        // A configured acquisition is mandatory at execution time. Missing
        // personas/adapters are already reported as blocking problems below.
        blocking: true,
        ...(!persona
          ? { reason: 'Aucune persona n’est déclarée pour ce fournisseur.' }
          : !available
            ? { reason: `Persona '${persona}' absente.` }
            : !declaration.acquire
              ? {
                  reason:
                    'Aucun adaptateur local de réacquisition n’est déclaré.',
                }
              : {}),
      });
      if (!persona || !available || !declaration.acquire) {
        problems.push({
          code:
            !persona || !available
              ? 'persona-missing'
              : 'acquire-adapter-missing',
          message: persona
            ? !available
              ? `Persona '${persona}' absente pour '${declaration.resource}'.`
              : `Aucun adaptateur ne peut réacquérir '${declaration.resource}' pour '${persona}'.`
            : `Aucune persona n’est déclarée pour '${declaration.resource}'.`,
          blocking: true,
        });
      }
    } else if (declaration.role === 'holds') {
      const references = options.archive.events
        .filter(
          (event) =>
            (event.globalElapsedMs ?? event.elapsedMs ?? 0) <=
            options.targetElapsedMs,
        )
        .flatMap((event) => event.refs ?? [])
        .filter(
          (ref) =>
            declaration.path !== undefined &&
            ref.direction === 'in' &&
            ref.path === declaration.path,
        );
      for (const ref of references) {
        substitutions.push({
          resource: declaration.resource,
          fingerprint: ref.fingerprint,
          placeholder: `craft-ref:${ref.fingerprint}`,
          path: ref.path,
        });
      }
      steps.push({
        id: `substitute:${primitive}:${declaration.resource}`,
        kind: 'substitute',
        primitive,
        resource: declaration.resource,
        ...(declaration.calls ? { allowedCalls: declaration.calls } : {}),
        blocking: !declaration.write,
        ...(!declaration.write
          ? { reason: 'Aucun adaptateur de substitution déclaré.' }
          : {}),
      });
      if (!declaration.write) {
        problems.push({
          code: 'resource-without-substitution',
          message: `La ressource '${declaration.resource}' est gardée par '${primitive}', mais aucun adaptateur de substitution n’est déclaré.`,
          blocking: true,
        });
      }
    } else if (declaration.role === 'restores') {
      steps.push({
        id: `restore:${primitive}:${declaration.resource}`,
        kind: 'restore',
        primitive,
        resource: declaration.resource,
        ...(declaration.calls ? { allowedCalls: declaration.calls } : {}),
        blocking: typeof declaration.write !== 'function',
        ...(typeof declaration.write === 'function'
          ? {}
          : { reason: 'Aucun adaptateur de restauration déclaré.' }),
      });
      if (typeof declaration.write !== 'function') {
        problems.push({
          code: 'resource-without-restore-adapter',
          message: `La ressource '${declaration.resource}' doit être restaurée par '${primitive}', mais aucun adaptateur n’est déclaré.`,
          blocking: true,
        });
      }
    } else if (declaration.role === 'requires') {
      const hasProvider = availableResources.has(declaration.resource);
      steps.push({
        id: `refetch:${primitive}:${declaration.resource}`,
        kind: 'refetch',
        primitive,
        resource: declaration.resource,
        ...(declaration.identity ? { identity: true } : {}),
        ...(declaration.calls ? { allowedCalls: declaration.calls } : {}),
        blocking: !hasProvider,
        ...(!hasProvider
          ? {
              reason:
                'Aucune primitive ne fournit ni ne conserve cette ressource.',
            }
          : {}),
      });
      if (!hasProvider) {
        problems.push({
          code: 'resource-without-provider',
          message: `Aucune primitive ne fournit ou ne conserve la ressource requise '${declaration.resource}'.`,
          blocking: true,
        });
      }
    }
  }

  const events = options.archive.events.filter(
    (event) =>
      (event.globalElapsedMs ?? event.elapsedMs ?? 0) <=
      options.targetElapsedMs,
  );
  const checkpoint = [...events]
    .reverse()
    .find(
      (event) =>
        event.kind === 'snapshot' &&
        event.name === 'replay-checkpoint' &&
        event.payload &&
        typeof event.payload === 'object',
    );
  const checkpointPayload = checkpoint?.payload as
    | Record<string, unknown>
    | undefined;
  const pendingTasks = Array.isArray(checkpointPayload?.['pendingTasks'])
    ? checkpointPayload['pendingTasks']
    : [];
  const temporalNow =
    typeof checkpointPayload?.['temporalNow'] === 'number'
      ? checkpointPayload['temporalNow']
      : undefined;
  for (const [index, task] of pendingTasks.entries()) {
    if (!task || typeof task !== 'object') continue;
    const record = task as Record<string, unknown>;
    const owner =
      typeof record['owner'] === 'string' ? record['owner'] : undefined;
    const dueAt =
      typeof record['dueAt'] === 'number' ? record['dueAt'] : undefined;
    const delayMs =
      dueAt !== undefined && temporalNow !== undefined
        ? Math.max(0, dueAt - temporalNow)
        : undefined;
    steps.push({
      id: `rearm-task:${String(record['kind'] ?? 'task')}:${index}`,
      kind: 'rearm-task',
      ...(owner ? { primitive: owner } : {}),
      taskIndex: index,
      ...(typeof record['kind'] === 'string'
        ? { taskKind: record['kind'] }
        : {}),
      blocking: owner === undefined || delayMs === undefined,
      ...(delayMs === undefined ? {} : { delayMs }),
      ...(owner === undefined || delayMs === undefined
        ? {
            reason:
              'La tâche enregistrée ne possède pas de cause et d’échéance réarmables.',
          }
        : {}),
    });
  }
  const expectedCalls = [
    ...new Set(
      events.flatMap((event) => {
        if (event.kind !== 'http' || event.phase !== 'started') return [];
        const payload = event.payload;
        if (!payload || typeof payload !== 'object') return [];
        const source = (payload as Record<string, unknown>)['source'];
        const url = (payload as Record<string, unknown>)['url'];
        return typeof url === 'string'
          ? [`${String(source ?? 'http')} ${url}`]
          : [];
      }),
    ),
  ].sort();
  const expectedOutcomes = recordedExpectedOutcomesOf(
    options.archive,
    options.declarations,
    options.targetElapsedMs,
  );

  // A holds adapter can store a stale credential from the snapshot. Providers
  // must reacquire the resource first, then state holders can replace their
  // value, and only then may dependent reads run. Registry enumeration order
  // is an implementation detail and must not decide this execution order.
  const stepOrder: Readonly<Record<DebugSessionResumeStepKind, number>> = {
    acquire: 0,
    substitute: 1,
    restore: 2,
    refetch: 3,
    'rearm-task': 4,
  };
  steps.sort((left, right) => stepOrder[left.kind] - stepOrder[right.kind]);

  const blocking =
    problems.some((problem) => problem.blocking) ||
    steps.some((step) => step.blocking && step.kind !== 'acquire');
  return {
    format: 'craft-debug-session-resume-plan',
    version: 1,
    targetElapsedMs: options.targetElapsedMs,
    clockPolicy: options.clockPolicy ?? 'real',
    status: blocking ? 'refused' : 'ready',
    steps,
    problems,
    expectedCalls,
    expectedOutcomes,
    substitutions,
  };
}

function recordedExpectedOutcomesOf(
  archive: SendContextReplayExport,
  declarations: Readonly<Record<string, CraftResumeDeclaration>>,
  targetElapsedMs: number,
): NonNullable<DebugSessionResumePlan['expectedOutcomes']> {
  const declared = new Map<
    string,
    NonNullable<DebugSessionResumePlan['expectedOutcomes']>[number]
  >();
  for (const declaration of Object.values(declarations)) {
    if (declaration.expect?.outcome !== 'recorded') continue;
    for (const call of declaration.calls ?? []) {
      declared.set(call, {
        call,
        outcome: 'recorded',
        ...(declaration.expect.match === undefined
          ? {}
          : { match: declaration.expect.match }),
      });
    }
  }
  if (declared.size === 0) return [];

  const started = new Map<string, ReadonlySet<string>>();
  const matched = new Map<string, number | undefined>();
  for (const event of archive.events) {
    if (!event.operationId || event.kind !== 'http') continue;
    const key = `${event.participantId ?? ''}:${event.operationId}`;
    if (event.phase === 'started') {
      started.set(key, callNamesOf(event.payload));
      continue;
    }
    if (event.phase !== 'succeeded') continue;
    const names = started.get(key);
    if (!names) continue;
    const call = [...declared.keys()].find((name) => names.has(name));
    if (!call) continue;
    const elapsed = event.globalElapsedMs ?? event.elapsedMs ?? 0;
    if (elapsed <= targetElapsedMs || matched.has(call)) continue;
    const response = isRecord(event.response) ? event.response : undefined;
    const status = response?.['status'];
    matched.set(
      call,
      typeof status === 'number' && Number.isInteger(status) ? status : undefined,
    );
  }
  return [...declared.values()].map((outcome) => {
    const status = matched.get(outcome.call);
    return status === undefined ? outcome : { ...outcome, status };
  });
}

function callNamesOf(payload: unknown): ReadonlySet<string> {
  if (!isRecord(payload)) return new Set();
  let body = payload['body'];
  for (let depth = 0; depth < 3 && typeof body === 'string'; depth += 1) {
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      break;
    }
  }
  if (!isRecord(body) || typeof body['id'] !== 'string') return new Set();
  return new Set([body['id'], `function:${body['id']}`]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
