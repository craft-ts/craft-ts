import type {
  CraftResumeDeclaration,
  CraftResumePersona,
  SendContextReplayExport,
} from '@craft-ts/core';
import { supportsDebugSessionResume } from './debug-session-format';
import {
  decodeNestedJson,
  readResumePathValue,
} from './debug-session-resume-path';

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

/** The identity a recording had at the target, and where it was read. */
export interface RecordedResumeIdentity {
  readonly resource: string;
  readonly role: string;
  readonly id?: string;
  /** Primitive whose declaration carries the identity paths. */
  readonly primitive: string;
  readonly source: 'response' | 'state' | 'storage';
  readonly elapsedMs: number;
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
  /** Persona role used by an acquisition. */
  readonly persona?: string;
  readonly personaId?: string;
  /** The identity the acquisition must reproduce, checked after it runs. */
  readonly expectedIdentity?: RecordedResumeIdentity;
  /** The persona was chosen by a person instead of the recording (assisted resume). */
  readonly assisted?: boolean;
  /** The resource was dead at the target: the step is shown, never run. */
  readonly unneeded?: boolean;
  /** Steps that must have succeeded first; a failure only blocks its dependants. */
  readonly dependsOn?: readonly string[];
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
    readonly onMismatch?: 'abort' | 'recorded' | 'degraded';
    /** The archived response body, served by the `recorded` policy and compared on `match`. */
    readonly recordedBody?: unknown;
  }>[];
  /**
   * Recorded placeholders and the resource that replaces them: `valuePath`
   * reads the new value in the reacquired resource (`$.token`).
   */
  readonly substitutions: readonly Readonly<{
    resource: string;
    fingerprint: string;
    placeholder: string;
    path: string;
    valuePath: string;
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
  /**
   * Assisted resume, chosen explicitly in the dashboard: reacquire a resource
   * with this persona role instead of the recorded identity.
   */
  readonly assistedPersonas?: Readonly<Record<string, string>>;
  /** Expectations declared in code by primitives not mounted at the target. */
  readonly expectations?: readonly Readonly<{
    resource: string;
    calls: readonly string[];
    expect: NonNullable<CraftResumeDeclaration['expect']>;
    onMismatch?: CraftResumeDeclaration['onMismatch'];
  }>[];
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
  const liveness = resolveResumeResourceLiveness(
    options.archive,
    options.targetElapsedMs,
    options.declarations,
  );
  const identities = resolveRecordedIdentity(
    options.archive,
    options.targetElapsedMs,
    options.declarations,
  );
  const isAlive = (resource: string) => liveness[resource]?.alive !== false;
  const unneededReason = (resource: string) =>
    `Non nécessaire : ${liveness[resource]?.reason ?? 'ressource absente au point ciblé.'}`;
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
    const resource = declaration.resource;
    const alive = isAlive(resource);
    if (declaration.role === 'provides') {
      if (!alive) {
        steps.push({
          id: `acquire:${primitive}:${resource}`,
          kind: 'acquire',
          primitive,
          resource,
          unneeded: true,
          blocking: false,
          reason: unneededReason(resource),
        });
        continue;
      }
      const choice = choosePersona(
        resource,
        declaration,
        options.declarations,
        identities[resource],
        options.personas ?? [],
        options.assistedPersonas?.[resource],
      );
      if (choice.problem) problems.push(choice.problem);
      if (choice.persona && !declaration.acquire)
        problems.push({
          code: 'acquire-adapter-missing',
          message: `Aucun adaptateur ne peut réacquérir '${resource}' pour '${choice.persona.role}'.`,
          blocking: true,
        });
      steps.push({
        id: `acquire:${primitive}:${resource}`,
        kind: 'acquire',
        primitive,
        resource,
        ...(choice.persona ? { persona: choice.persona.role } : {}),
        ...(choice.persona?.id ? { personaId: choice.persona.id } : {}),
        ...(choice.expected ? { expectedIdentity: choice.expected } : {}),
        ...(choice.assisted ? { assisted: true } : {}),
        ...(declaration.calls ? { allowedCalls: declaration.calls } : {}),
        // A configured acquisition is mandatory at execution time. Missing
        // personas/adapters are already reported as blocking problems.
        blocking: true,
        ...(choice.problem
          ? { reason: choice.problem.message }
          : !declaration.acquire
            ? { reason: 'Aucun adaptateur local de réacquisition n’est déclaré.' }
            : choice.persona
              ? { reason: personaLabel(choice) }
              : {}),
      });
    } else if (declaration.role === 'holds') {
      if (!alive) {
        steps.push({
          id: `substitute:${primitive}:${resource}`,
          kind: 'substitute',
          primitive,
          resource,
          unneeded: true,
          blocking: false,
          reason: unneededReason(resource),
        });
        continue;
      }
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
            referencePathEndsWith(ref.path, declaration.path),
        );
      for (const ref of references) {
        if (
          substitutions.some(
            (item) =>
              item.resource === resource && item.fingerprint === ref.fingerprint,
          )
        )
          continue;
        substitutions.push({
          resource,
          fingerprint: ref.fingerprint,
          placeholder: `craft-ref:${ref.fingerprint}`,
          path: ref.path,
          valuePath: declaration.path!,
        });
      }
      steps.push({
        id: `substitute:${primitive}:${resource}`,
        kind: 'substitute',
        primitive,
        resource,
        ...(declaration.calls ? { allowedCalls: declaration.calls } : {}),
        blocking: !declaration.write,
        ...(!declaration.write
          ? { reason: 'Aucun adaptateur de substitution déclaré.' }
          : {}),
      });
      if (!declaration.write) {
        problems.push({
          code: 'resource-without-substitution',
          message: `La ressource '${resource}' est gardée par '${primitive}', mais aucun adaptateur de substitution n’est déclaré.`,
          blocking: true,
        });
      }
    } else if (declaration.role === 'restores') {
      steps.push({
        id: `restore:${primitive}:${resource}`,
        kind: 'restore',
        primitive,
        resource,
        ...(declaration.calls ? { allowedCalls: declaration.calls } : {}),
        blocking: typeof declaration.write !== 'function',
        ...(typeof declaration.write === 'function'
          ? {}
          : { reason: 'Aucun adaptateur de restauration déclaré.' }),
      });
      if (typeof declaration.write !== 'function') {
        problems.push({
          code: 'resource-without-restore-adapter',
          message: `La ressource '${resource}' doit être restaurée par '${primitive}', mais aucun adaptateur n’est déclaré.`,
          blocking: true,
        });
      }
    } else if (declaration.role === 'requires') {
      // An action that uses the resource is never re-run by the resume.
      if (declaration.refetch === false) continue;
      if (!alive) {
        steps.push({
          id: `refetch:${primitive}:${resource}`,
          kind: 'refetch',
          primitive,
          resource,
          unneeded: true,
          blocking: false,
          reason: unneededReason(resource),
        });
        continue;
      }
      const hasProvider = availableResources.has(resource);
      steps.push({
        id: `refetch:${primitive}:${resource}`,
        kind: 'refetch',
        primitive,
        resource,
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
          message: `Aucune primitive ne fournit ou ne conserve la ressource requise '${resource}'.`,
          blocking: true,
        });
      }
    }
  }

  // The identity a resource must have after its acquisition is checked again
  // where the server answers for it: the refetch of the `requires` primitive
  // that declares identity paths.
  for (const [index, step] of steps.entries()) {
    if (step.kind !== 'refetch' || step.unneeded || !step.resource) continue;
    const declaration = step.primitive
      ? options.declarations[step.primitive]
      : undefined;
    if (!declaration?.identity) continue;
    const acquisition = steps.find(
      (candidate) =>
        candidate.kind === 'acquire' &&
        candidate.resource === step.resource &&
        !candidate.unneeded,
    );
    if (acquisition?.expectedIdentity)
      steps[index] = { ...step, expectedIdentity: acquisition.expectedIdentity };
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
    [
      ...Object.values(options.declarations),
      ...(options.expectations ?? []).map((expectation) => ({
        ...expectation,
        role: 'requires' as const,
      })),
    ],
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
  const planned = steps.map((step) => {
    if (step.unneeded || !step.resource) return step;
    const sameResource = steps.filter(
      (candidate) =>
        candidate.resource === step.resource && !candidate.unneeded,
    );
    const dependsOn =
      step.kind === 'substitute' || step.kind === 'refetch'
        ? sameResource
            .filter(
              (candidate) =>
                candidate.kind === 'acquire' ||
                (step.kind === 'refetch' && candidate.kind === 'substitute'),
            )
            .map((candidate) => candidate.id)
        : [];
    return dependsOn.length ? { ...step, dependsOn } : step;
  });

  const blocking =
    problems.some((problem) => problem.blocking) ||
    planned.some((step) => step.blocking && step.kind !== 'acquire');
  return {
    format: 'craft-debug-session-resume-plan',
    version: 1,
    targetElapsedMs: options.targetElapsedMs,
    clockPolicy: options.clockPolicy ?? 'real',
    status: blocking ? 'refused' : 'ready',
    steps: planned,
    problems,
    expectedCalls,
    expectedOutcomes,
    substitutions,
  };
}

function recordedExpectedOutcomesOf(
  archive: SendContextReplayExport,
  declarations: readonly CraftResumeDeclaration[],
  targetElapsedMs: number,
): NonNullable<DebugSessionResumePlan['expectedOutcomes']> {
  const declared = new Map<
    string,
    NonNullable<DebugSessionResumePlan['expectedOutcomes']>[number]
  >();
  for (const declaration of declarations) {
    if (declaration.expect?.outcome !== 'recorded') continue;
    for (const call of declaration.calls ?? []) {
      declared.set(call, {
        call,
        outcome: 'recorded',
        ...(declaration.expect.match === undefined
          ? {}
          : { match: declaration.expect.match }),
        ...(declaration.onMismatch === undefined
          ? {}
          : { onMismatch: declaration.onMismatch }),
      });
    }
  }
  if (declared.size === 0) return [];

  const started = new Map<string, ReadonlySet<string>>();
  const matched = new Map<
    string,
    Readonly<{ status?: number; body?: unknown }>
  >();
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
    matched.set(call, {
      ...(typeof status === 'number' && Number.isInteger(status)
        ? { status }
        : {}),
      ...(response && 'body' in response ? { body: response['body'] } : {}),
    });
  }
  return [...declared.values()].map((outcome) => {
    const recorded = matched.get(outcome.call);
    return recorded
      ? {
          ...outcome,
          ...(recorded.status === undefined ? {} : { status: recorded.status }),
          // The archived body travels only when the policy needs it.
          ...(recorded.body !== undefined &&
          (outcome.onMismatch === 'recorded' || outcome.match !== undefined)
            ? { recordedBody: recorded.body }
            : {}),
        }
      : outcome;
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

type ResumeLiveness = Readonly<{ alive: boolean; reason: string }>;

/**
 * Whether each declared resource still existed at the target. A resource
 * nobody holds, requires or revokes is assumed alive: nothing in the
 * recording can tell otherwise. Otherwise the latest evidence wins: a value
 * held (by a holder or by the provider itself) or a successful `requires`
 * response keeps it alive; an empty holder, a failed response or a
 * `revokes` call afterwards kills it.
 */
export function resolveResumeResourceLiveness(
  archive: SendContextReplayExport,
  targetElapsedMs: number,
  declarations: Readonly<Record<string, CraftResumeDeclaration>>,
): Readonly<Record<string, ResumeLiveness>> {
  const events = eventsUntil(archive, targetElapsedMs);
  const values = recordedPrimitiveValues(events);
  const responses = recordedCallResponses(events);
  const storage = recordedStorageValues(events);
  const evidence = new Map<
    string,
    { sequence: number; alive: boolean; reason: string }
  >();
  const consider = (
    resource: string,
    sequence: number,
    alive: boolean,
    reason: string,
  ) => {
    const current = evidence.get(resource);
    if (!current || sequence >= current.sequence)
      evidence.set(resource, { sequence, alive, reason });
  };
  const tracked = new Set<string>();
  for (const [address, declaration] of Object.entries(declarations)) {
    const resource = declaration.resource;
    if (declaration.role === 'holds') {
      tracked.add(resource);
      const stored = declaration.identity?.storageKey
        ? storage.get(declaration.identity.storageKey)
        : undefined;
      if (stored)
        consider(
          resource,
          stored.sequence,
          hasResumeValue(stored.value),
          hasResumeValue(stored.value)
            ? `valeur restaurée depuis le storage (${declaration.identity?.storageKey}).`
            : `storage ${declaration.identity?.storageKey} vide au point ciblé.`,
        );
      const recorded = values.get(ordinalFree(address));
      if (recorded)
        consider(
          resource,
          recorded.sequence,
          hasResumeValue(recorded.value),
          hasResumeValue(recorded.value)
            ? `valeur gardée par ${labelOf(address)}.`
            : `${labelOf(address)} est vide au point ciblé.`,
        );
    } else if (declaration.role === 'provides') {
      // A provider that holds what it loaded (a catalog query) proves the
      // resource existed; a later revocation still wins.
      const recorded = values.get(ordinalFree(address));
      if (recorded && hasResumeValue(recorded.value)) {
        tracked.add(resource);
        consider(
          resource,
          recorded.sequence,
          true,
          `valeur fournie par ${labelOf(address)}.`,
        );
      }
    } else if (declaration.role === 'requires') {
      tracked.add(resource);
      const response = (declaration.calls ?? [])
        .flatMap((call) => responses.get(call) ?? [])
        .sort((left, right) => left.sequence - right.sequence)
        .at(-1);
      if (response)
        consider(
          resource,
          response.sequence,
          response.ok,
          response.ok
            ? `dernière réponse de ${labelOf(address)} réussie.`
            : `dernière réponse de ${labelOf(address)} en échec (HTTP ${response.status ?? '?'}).`,
        );
    } else if (declaration.role === 'revokes') {
      tracked.add(resource);
      const label = labelOf(address);
      const call = events
        .filter(
          (event) =>
            event.kind === 'craft' &&
            event.phase === 'started' &&
            event.name === label,
        )
        .at(-1);
      if (call)
        consider(resource, call.sequence, false, `${label} a été appelée avant le point ciblé.`);
    }
  }
  const result: Record<string, ResumeLiveness> = {};
  for (const declaration of Object.values(declarations)) {
    const resource = declaration.resource;
    if (resource in result) continue;
    const found = evidence.get(resource);
    result[resource] = !tracked.has(resource)
      ? { alive: true, reason: 'aucune primitive ne permet de savoir si elle existait.' }
      : found
        ? { alive: found.alive, reason: found.reason }
        : { alive: false, reason: 'aucune trace de la ressource avant le point ciblé.' };
  }
  return result;
}

/**
 * The last identity known before the target, per resource. Sources, by
 * priority: the recorded response of a `requires` primitive with identity
 * paths, the value of a `holds` primitive, then its restored storage entry.
 */
export function resolveRecordedIdentity(
  archive: SendContextReplayExport,
  targetElapsedMs: number,
  declarations: Readonly<Record<string, CraftResumeDeclaration>>,
): Readonly<Record<string, RecordedResumeIdentity>> {
  const events = eventsUntil(archive, targetElapsedMs);
  const values = recordedPrimitiveValues(events);
  const responses = recordedCallResponses(events);
  const storage = recordedStorageValues(events);
  const result: Record<string, RecordedResumeIdentity> = {};
  const priority = { response: 0, state: 1, storage: 2 } as const;
  const offer = (candidate: RecordedResumeIdentity, sequence: number) => {
    const current = result[candidate.resource];
    const currentSequence = sequences.get(candidate.resource) ?? -1;
    if (
      !current ||
      priority[candidate.source] < priority[current.source] ||
      (candidate.source === current.source && sequence >= currentSequence)
    ) {
      result[candidate.resource] = candidate;
      sequences.set(candidate.resource, sequence);
    }
  };
  const sequences = new Map<string, number>();
  for (const [address, declaration] of Object.entries(declarations)) {
    const identity = declaration.identity;
    if (!identity) continue;
    const read = (value: unknown) => {
      const role = readResumePathValue(value, identity.role);
      const id =
        identity.id === undefined
          ? undefined
          : readResumePathValue(value, identity.id);
      return typeof role === 'string' && role
        ? {
            role,
            ...(typeof id === 'string' || typeof id === 'number'
              ? { id: String(id) }
              : {}),
          }
        : undefined;
    };
    if (declaration.role === 'requires') {
      for (const response of (declaration.calls ?? []).flatMap(
        (call) => responses.get(call) ?? [],
      )) {
        if (!response.ok) continue;
        const found = read(response.body);
        if (found)
          offer(
            {
              resource: declaration.resource,
              ...found,
              primitive: address,
              source: 'response',
              elapsedMs: response.elapsedMs,
            },
            response.sequence,
          );
      }
    }
    if (declaration.role === 'holds') {
      const recorded = values.get(ordinalFree(address));
      const found = recorded && read(recorded.value);
      if (recorded && found)
        offer(
          {
            resource: declaration.resource,
            ...found,
            primitive: address,
            source: 'state',
            elapsedMs: recorded.elapsedMs,
          },
          recorded.sequence,
        );
      const stored = identity.storageKey
        ? storage.get(identity.storageKey)
        : undefined;
      const fromStorage = stored && read(stored.value);
      if (stored && fromStorage)
        offer(
          {
            resource: declaration.resource,
            ...fromStorage,
            primitive: address,
            source: 'storage',
            elapsedMs: stored.elapsedMs,
          },
          stored.sequence,
        );
    }
  }
  return result;
}

type PersonaChoice = Readonly<{
  persona?: Pick<CraftResumePersona, 'role' | 'id'>;
  expected?: RecordedResumeIdentity;
  assisted?: boolean;
  problem?: DebugSessionResumePlan['problems'][number];
}>;

function choosePersona(
  resource: string,
  provider: CraftResumeDeclaration,
  declarations: Readonly<Record<string, CraftResumeDeclaration>>,
  recorded: RecordedResumeIdentity | undefined,
  personas: readonly Pick<CraftResumePersona, 'role' | 'id'>[],
  assistedRole: string | undefined,
): PersonaChoice {
  const missing = (message: string): PersonaChoice => ({
    problem: { code: 'persona-missing', message, blocking: true },
  });
  if (assistedRole) {
    const persona = personas.find((item) => item.role === assistedRole);
    if (!persona)
      return missing(`Persona '${assistedRole}' absente pour la reprise assistée de '${resource}'.`);
    return {
      persona,
      assisted: true,
      ...(recorded
        ? {
            expected: {
              ...recorded,
              role: persona.role,
              ...(persona.id === undefined ? { id: undefined } : { id: persona.id }),
            },
          }
        : {}),
    };
  }
  const carriesIdentity = Object.values(declarations).some(
    (declaration) =>
      declaration.resource === resource &&
      declaration.identity !== undefined &&
      (declaration.role === 'holds' || declaration.role === 'requires'),
  );
  if (carriesIdentity) {
    if (!recorded)
      return {
        problem: {
          code: 'identity-unknown',
          message: `Aucune identité enregistrée pour '${resource}' avant le point ciblé.`,
          blocking: true,
        },
      };
    const sameRole = personas.filter((item) => item.role === recorded.role);
    const persona =
      recorded.id === undefined
        ? sameRole[0]
        : (sameRole.find((item) => item.id === recorded.id) ??
          sameRole.find((item) => item.id === undefined));
    if (!persona)
      return missing(
        `Aucune persona pour le rôle '${recorded.role}'${recorded.id ? ` (${recorded.id})` : ''}, identité enregistrée de '${resource}'.`,
      );
    return { persona, expected: recorded };
  }
  const role = provider.persona;
  if (!role) return missing(`Aucune persona n’est déclarée pour '${resource}'.`);
  const persona = personas.find((item) => item.role === role);
  return persona ? { persona } : missing(`Persona '${role}' absente pour '${resource}'.`);
}

function personaLabel(choice: PersonaChoice): string {
  const persona = choice.persona;
  if (!persona) return '';
  const who = `${persona.id ?? persona.role} (${persona.role})`;
  if (choice.assisted)
    return `Reprise assistée : connexion en tant que ${who}, à la place de l’identité enregistrée.`;
  const expected = choice.expected;
  return expected
    ? `Connexion en tant que ${who} — identité enregistrée : ${expected.role}${expected.id ? ` · ${expected.id}` : ''}, depuis ${labelOf(expected.primitive)} (${identitySourceLabel[expected.source]}).`
    : `Connexion en tant que ${who}.`;
}

const identitySourceLabel = {
  response: 'réponse enregistrée',
  state: 'état restauré',
  storage: 'storage restauré',
} as const;

function eventsUntil(
  archive: SendContextReplayExport,
  targetElapsedMs: number,
): SendContextReplayExport['events'] {
  return archive.events
    .filter(
      (event) =>
        (event.globalElapsedMs ?? event.elapsedMs ?? 0) <= targetElapsedMs,
    )
    .sort((left, right) => left.sequence - right.sequence);
}

type RecordedValue = Readonly<{
  value: unknown;
  sequence: number;
  elapsedMs: number;
}>;

/** Last value of each primitive, keyed by its ordinal-free address. */
function recordedPrimitiveValues(
  events: SendContextReplayExport['events'],
): ReadonlyMap<string, RecordedValue> {
  const values = new Map<string, RecordedValue>();
  const set = (address: string, value: unknown, event: (typeof events)[number]) =>
    values.set(ordinalFree(address), {
      value,
      sequence: event.sequence,
      elapsedMs: event.globalElapsedMs ?? event.elapsedMs ?? 0,
    });
  for (const event of events) {
    if (event.kind === 'primitive' && isRecord(event.state)) {
      const changed = isRecord(event.payload) ? event.payload['address'] : undefined;
      if (event.name === 'primitive-change' && typeof changed === 'string') {
        // An undefined value is dropped by JSON: its absence is the value.
        set(changed, event.state[changed], event);
        continue;
      }
      for (const [address, value] of Object.entries(event.state))
        set(address, value, event);
      continue;
    }
    if (
      event.kind === 'snapshot' &&
      event.name === 'replay-checkpoint' &&
      isRecord(event.payload) &&
      isRecord(event.payload['primitives'])
    )
      for (const [address, value] of Object.entries(event.payload['primitives']))
        set(address, value, event);
  }
  return values;
}

type RecordedResponse = Readonly<{
  ok: boolean;
  status?: number;
  body: unknown;
  sequence: number;
  elapsedMs: number;
}>;

/** Responses keyed by every name of the call that produced them. */
function recordedCallResponses(
  events: SendContextReplayExport['events'],
): ReadonlyMap<string, readonly RecordedResponse[]> {
  const started = new Map<string, ReadonlySet<string>>();
  const responses = new Map<string, RecordedResponse[]>();
  for (const event of events) {
    if (event.kind !== 'http' || !event.operationId) continue;
    const key = `${event.participantId ?? ''}:${event.operationId}`;
    if (event.phase === 'started') {
      started.set(key, callNamesOf(event.payload));
      continue;
    }
    if (event.phase !== 'succeeded' && event.phase !== 'failed') continue;
    const names = started.get(key);
    if (!names) continue;
    const response = isRecord(event.response) ? event.response : undefined;
    const status =
      typeof response?.['status'] === 'number' ? response['status'] : undefined;
    const recorded: RecordedResponse = {
      ok: event.phase === 'succeeded' && (status === undefined || status < 400),
      ...(status === undefined ? {} : { status }),
      body: decodeNestedJson(response?.['body']),
      sequence: event.sequence,
      elapsedMs: event.globalElapsedMs ?? event.elapsedMs ?? 0,
    };
    for (const name of names)
      responses.set(name, [...(responses.get(name) ?? []), recorded]);
  }
  return responses;
}

/** Last restored value of each persisted key (`session.v1`). */
function recordedStorageValues(
  events: SendContextReplayExport['events'],
): ReadonlyMap<string, RecordedValue> {
  const values = new Map<string, RecordedValue>();
  const offer = (entry: unknown, event: (typeof events)[number]) => {
    if (!isRecord(entry) || typeof entry['key'] !== 'string') return;
    values.set(entry['key'], {
      value: entry['value'],
      sequence: event.sequence,
      elapsedMs: event.globalElapsedMs ?? event.elapsedMs ?? 0,
    });
  };
  for (const event of events) {
    const payload = isRecord(event.payload) ? event.payload : undefined;
    if (!payload) continue;
    if (event.kind === 'storage') {
      if (Array.isArray(payload['entries']))
        for (const entry of payload['entries']) offer(entry, event);
      else offer(payload, event);
    } else if (
      event.kind === 'snapshot' &&
      event.name === 'replay-checkpoint' &&
      Array.isArray(payload['storage'])
    )
      for (const entry of payload['storage']) offer(entry, event);
  }
  return values;
}

/**
 * A recorded reference belongs to a holder when its archive path ends with
 * the holder's declared path: `storage.localStorage[0][1].queryValue.token`
 * for `$.token`.
 */
function referencePathEndsWith(path: string, declared: string): boolean {
  const keys = (value: string) =>
    value
      .replace(/^\$/, '')
      .split(/[.[\]"']+/)
      .filter(Boolean);
  const suffix = keys(declared);
  const full = keys(path);
  return (
    suffix.length > 0 &&
    suffix.length <= full.length &&
    suffix.every((key, index) => full[full.length - suffix.length + index] === key)
  );
}

function hasResumeValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return true;
}

function ordinalFree(address: string): string {
  return address
    .split(' / ')
    .map((part) => part.replace(/#\d+$/, ''))
    .join(' / ');
}

/** `query:currentUser` for `service:session / query:currentUser#1`. */
function labelOf(address: string): string {
  return ordinalFree(address).split(' / ').at(-1) ?? address;
}
