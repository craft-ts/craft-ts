import type {
  SendContextEvent,
  SendContextReplayExport,
  SendContextReplaySnapshot,
  SendContextSession,
} from '@craft-ts/core';

/** Versioned, serializable snapshot for a stable replay restart point. */
export type ReplaySnapshotV1 = SendContextReplaySnapshot;

export type ReplayCommand = Readonly<{
  id: string;
  operationId: string;
  kind: 'restore-snapshot' | 'navigate' | 'invoke' | 'activate' | 'dispatch';
  sequence: number;
  atMs: number;
  participantId?: string;
  dependsOn: readonly string[];
  payload: Readonly<Record<string, unknown>>;
  expected: readonly ReplayObservation[];
}>;

export type ReplayObservation = Readonly<{
  eventId: string;
  kind: string;
  phase: string;
  operationId?: string;
  correlationId?: string;
  name?: string;
  source?: string;
  sequence: number;
  payload?: unknown;
  response?: unknown;
  state?: unknown;
}>;

export type ReplayPlanIssue = Readonly<{
  code:
    | 'invalid-selector'
    | 'missing-target'
    | 'missing-arguments'
    | 'missing-result'
    | 'missing-dependency'
    | 'ambiguous-target'
    | 'unsupported-transport'
    | 'invalid-snapshot';
  message: string;
  /** False marks a target that cannot be decided until a lazy route mounts. */
  blocking?: boolean;
  eventId?: string;
  operationId?: string;
}>;

export type ReplayPlan = Readonly<{
  version: 1;
  status: 'replayable' | 'partial' | 'unreplayable';
  commands: readonly ReplayCommand[];
  observations: readonly ReplayObservation[];
  issues: readonly ReplayPlanIssue[];
}>;

export type ReplayTargetKind = 'route' | 'method' | 'activation';
export type ReplayTargetResolution =
  | 'resolved'
  | 'missing'
  | 'ambiguous'
  | 'unknown';
export type ReplayTargetResolver = (
  kind: ReplayTargetKind,
  target: string,
) => ReplayTargetResolution;

/** Capture only at a quiescent boundary; component instances are never stored. */
export function createReplaySnapshot(
  input: Readonly<{
    appVersion: string;
    routeUrl: string;
    primitives: Readonly<Record<string, unknown>>;
    storage: ReplaySnapshotV1['storage'];
    inFlightOperations: number;
    capturedAt?: number;
  }>,
): ReplaySnapshotV1 {
  if (input.inFlightOperations !== 0)
    throw new Error('A replay snapshot requires zero in-flight operations.');
  if (!input.appVersion.trim() || !input.routeUrl.trim())
    throw new Error('A replay snapshot requires an app version and route URL.');
  return {
    format: 'craft-debug-replay-snapshot',
    version: 1,
    appVersion: input.appVersion,
    capturedAt: input.capturedAt ?? Date.now(),
    route: { url: input.routeUrl },
    primitives: input.primitives,
    storage: input.storage,
    capabilities: {
      primitives: true,
      storage: true,
      inFlightOperations: false,
    },
  };
}

/** Capture a checkpoint event so it is retained in the portable archive. */
export function recordReplaySnapshot(
  session: SendContextSession,
  input: Parameters<typeof createReplaySnapshot>[0],
): ReplaySnapshotV1 {
  const snapshot = createReplaySnapshot(input);
  session.capture('snapshot', 'emitted', {
    name: 'replay-checkpoint',
    payload: snapshot,
    state: snapshot.primitives,
  });
  return snapshot;
}

/** Coalesces runtime notifications into versioned snapshots at quiet points. */
export function connectReplaySnapshotCapture(
  options: Readonly<{
    session: SendContextSession;
    appVersion: string;
    route(): string | undefined;
    primitives(): Readonly<Record<string, unknown>>;
    storage(): Promise<ReplaySnapshotV1['storage']>;
    isQuiescent(): boolean;
    subscribe(onChange: () => void): () => void;
    debounceMs?: number;
  }>,
): () => void {
  const debounceMs = Math.max(100, options.debounceMs ?? 350);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let capturing = false;
  let lastSnapshotKey = '';
  const schedule = () => {
    if (disposed || !options.session.activeClip) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void capture(), debounceMs);
  };
  const capture = async () => {
    timer = undefined;
    if (disposed || !options.session.activeClip) return;
    if (capturing) {
      schedule();
      return;
    }
    if (!options.isQuiescent()) {
      timer = setTimeout(() => void capture(), debounceMs);
      return;
    }
    const routeUrl = options.route();
    if (!routeUrl) return;
    const primitives = options.primitives();
    capturing = true;
    let storage: ReplaySnapshotV1['storage'];
    try {
      storage = await options.storage();
    } catch {
      capturing = false;
      return;
    }
    capturing = false;
    if (disposed || !options.session.activeClip) return;
    if (!options.isQuiescent()) {
      schedule();
      return;
    }
    const key = JSON.stringify([routeUrl, primitives, storage]);
    if (key === lastSnapshotKey) return;
    const snapshotInput = {
      appVersion: options.appVersion,
      routeUrl,
      primitives,
      storage,
      inFlightOperations: 0,
    } as const;
    const snapshot = createReplaySnapshot(snapshotInput);
    options.session.capture('snapshot', 'emitted', {
      name: 'replay-checkpoint',
      payload: snapshot,
      state: snapshot.primitives,
    });
    lastSnapshotKey = key;
  };
  const unsubscribe = options.subscribe(schedule);
  schedule();
  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

type ReplayInvocation = Readonly<{
  address: string;
  args: readonly unknown[];
  parentOperationId?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function eventTime(event: SendContextEvent): number {
  return event.globalElapsedMs ?? event.elapsedMs ?? event.timestamp;
}

function sameRecordedDestination(
  navigationUrl: string,
  href: string,
  startUrl: string,
): boolean {
  try {
    const base = new URL(startUrl);
    const navigation = new URL(navigationUrl, base);
    const target = new URL(href, base);
    return (
      navigation.pathname === target.pathname &&
      navigation.search === target.search &&
      navigation.hash === target.hash
    );
  } catch {
    return false;
  }
}

function replayInvocation(
  event: SendContextEvent,
): ReplayInvocation | undefined {
  if (event.kind !== 'craft' || event.phase !== 'started') return undefined;
  const payload = isRecord(event.payload) ? event.payload : undefined;
  const value = isRecord(payload?.['replayInvocation'])
    ? payload['replayInvocation']
    : undefined;
  if (typeof value?.['address'] !== 'string' || !Array.isArray(value['args']))
    return undefined;
  return {
    address: value['address'],
    args: value['args'],
    ...(typeof value['parentOperationId'] === 'string'
      ? { parentOperationId: value['parentOperationId'] }
      : {}),
  };
}

function rootInvocations(
  events: readonly SendContextEvent[],
): readonly SendContextEvent[] {
  const invocations = events.flatMap((event) =>
    replayInvocation(event) ? [event] : [],
  );
  const operationIds = new Set(
    invocations.flatMap((event) =>
      event.operationId ? [event.operationId] : [],
    ),
  );
  const roots = invocations.filter((event) => {
    const invocation = replayInvocation(event)!;
    return (
      !invocation.parentOperationId ||
      !operationIds.has(invocation.parentOperationId)
    );
  });
  const grouped = new Map<string, SendContextEvent[]>();
  for (const event of roots) {
    const invocation = replayInvocation(event)!;
    const key = `${event.correlationId ?? event.id}\u0000${invocation.address}`;
    const group = grouped.get(key) ?? [];
    group.push(event);
    grouped.set(key, group);
  }
  return [...grouped.values()]
    .map((group) => {
      const first = group.reduce((a, b) => (a.sequence < b.sequence ? a : b));
      const richest = group.reduce((a, b) =>
        (replayInvocation(a)?.args.length ?? 0) >=
        (replayInvocation(b)?.args.length ?? 0)
          ? a
          : b,
      );
      return { ...richest, sequence: first.sequence, id: first.id };
    })
    .sort((a, b) => a.sequence - b.sequence);
}

function asObservation(event: SendContextEvent): ReplayObservation {
  return {
    eventId: event.id,
    kind: event.kind,
    phase: event.phase,
    ...(event.operationId ? { operationId: event.operationId } : {}),
    ...(event.correlationId ? { correlationId: event.correlationId } : {}),
    ...(event.name ? { name: event.name } : {}),
    ...(event.source ? { source: event.source } : {}),
    sequence: event.sequence,
    ...(event.payload === undefined ? {} : { payload: event.payload }),
    ...(event.response === undefined ? {} : { response: event.response }),
    ...(event.state === undefined ? {} : { state: event.state }),
  };
}

/**
 * Compile the observed recording into explicit executable commands and
 * verification barriers. This is deliberately pure so it can run before the
 * replay target is modified.
 */
export function compileReplayPlan(
  session: SendContextReplayExport,
  resolveTarget?: ReplayTargetResolver,
): ReplayPlan {
  validateSelector?: (selector: string) => boolean,
  const events = [...session.events].sort((a, b) => a.sequence - b.sequence);
  const observations = events.map(asObservation);
  const issues: ReplayPlanIssue[] = [];
  const commands: ReplayCommand[] = [];
  const steps = events.filter(isReplayCommandEvent);
  const commandIdsByOperation = new Map<string, string>();
  const previousByParticipant = new Map<string, string>();
  const restartPoint = [...(session.snapshots ?? [])].sort(
    (left, right) => right.capturedAt - left.capturedAt,
  )[0];
  const restartCommandId = restartPoint
    ? `snapshot:${restartPoint.capturedAt}`
    : undefined;
  if (restartPoint && restartCommandId) {
    commands.push({
      id: restartCommandId,
      operationId: restartCommandId,
      kind: 'restore-snapshot',
      sequence: 0,
      atMs: 0,
      dependsOn: [],
      payload: { snapshot: restartPoint },
      expected: [],
    });
  }

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    const next = steps[index + 1];
    const interval = events.filter(
      (event) =>
        event.sequence >= step.sequence &&
        (next === undefined || event.sequence < next.sequence),
    );
    const roots = rootInvocations(interval);
    const nextHref = isRecord(next?.payload)
      ? next.payload['href']
      : undefined;
    const navigation =
      interval.find((event) => {
        if (
          event.kind !== 'navigation' ||
          event.phase !== 'started' ||
          !isRecord(event.payload) ||
          typeof event.payload['url'] !== 'string'
        )
          return false;
        // Angular can emit NavigationStart and route-load observations before
        // the delegated anchor click is captured. When the next interaction's
        // href matches, retain that navigation for the link command.
        return !(
          typeof nextHref === 'string' &&
          sameRecordedDestination(
            event.payload['url'],
            nextHref,
            session.startUrl,
          )
        );
      }) ??
      events.find((event) => {
        if (
          event.sequence >= step.sequence ||
          event.kind !== 'navigation' ||
          event.phase !== 'started' ||
          !isRecord(event.payload) ||
          typeof event.payload['url'] !== 'string' ||
          !isRecord(step.payload) ||
          typeof step.payload['href'] !== 'string'
        )
          return false;
        return sameRecordedDestination(
          event.payload['url'],
          step.payload['href'],
          session.startUrl,
        );
      });
    const activation = interval.find(
      (event) => event.kind === 'defer' && event.phase === 'started',
    );

    let kind: ReplayCommand['kind'] = 'dispatch';
    let sourceEvent = step;
    const stepPayload = isRecord(step.payload) ? step.payload : {};
    let payload: Record<string, unknown> = { ...stepPayload };
    if (navigation) {
      kind = 'navigate';
      sourceEvent = navigation;
      payload = isRecord(navigation.payload) ? { ...navigation.payload } : {};
    } else if (activation) {
      kind = 'activate';
      sourceEvent = activation;
      payload = isRecord(activation.payload) ? { ...activation.payload } : {};
    } else if (roots.length > 0) {
      kind = 'invoke';
      sourceEvent = roots[0]!;
      const invocation = replayInvocation(sourceEvent)!;
      payload = {
        address: invocation.address,
        args: invocation.args,
        invocations: roots.map((root) => {
          const rootInvocation = replayInvocation(root)!;
          return {
            eventId: root.id,
            sequence: root.sequence,
            address: rootInvocation.address,
            args: rootInvocation.args,
          };
        }),
      };
    }

    const invocation = replayInvocation(sourceEvent);
    if (kind === 'invoke' && invocation) {
      if (!invocation.address.trim())
        issues.push({
          code: 'missing-target',
          message: `Invocation ${sourceEvent.id} has no method address.`,
          eventId: sourceEvent.id,
        });
      if (invocation.args.some(hasUnreplayableValue))
        issues.push({
          code: 'missing-arguments',
          message: `Invocation ${sourceEvent.id} contains redacted or non-serializable arguments.`,
          eventId: sourceEvent.id,
        });
    }
    if (kind === 'navigate' && typeof payload['url'] !== 'string')
      issues.push({
        code: 'missing-target',
        message: `Navigation ${sourceEvent.id} has no recorded URL.`,
        eventId: sourceEvent.id,
      });
    if (
      kind === 'dispatch' &&
      ['dom', 'hover'].includes(step.kind) &&
      typeof payload['selector'] !== 'string'
    )
      issues.push({
        code: 'missing-target',
        message: `Interaction ${step.id} has no stable target selector.`,
        eventId: step.id,
      });

    const usesInteractionSelector = ['dom', 'hover'].includes(step.kind);
    if (
      validateSelector &&
      typeof stepPayload['selector'] === 'string' &&
      (usesInteractionSelector ||
        (step.kind === 'scroll' && stepPayload['target'] === 'element')) &&
      !validateSelector(stepPayload['selector'])
    )
      issues.push({
        code: 'invalid-selector',
        message: `${
          usesInteractionSelector ? 'Interaction' : 'Scroll event'
        } ${step.id} has an invalid CSS selector.`,
        eventId: step.id,
      });
    const targetKind: ReplayTargetKind | undefined =
      kind === 'navigate'
        ? 'route'
        : kind === 'invoke'
          ? 'method'
          : kind === 'activate'
            ? 'activation'
            : undefined;
    const targetAddress =
      targetKind === 'route'
        ? payload['url']
        : targetKind === 'method'
          ? payload['address']
          : payload['targetId'];
    if (targetKind && typeof targetAddress === 'string' && resolveTarget) {
      const resolution = resolveTarget(targetKind, targetAddress);
      if (resolution === 'missing')
        issues.push({
          code: 'missing-target',
          message: `${targetKind} target ${targetAddress} is missing.`,
          eventId: sourceEvent.id,
          ...(sourceEvent.operationId
            ? { operationId: sourceEvent.operationId }
            : {}),
        });
      else if (resolution === 'unknown')
        issues.push({
          code: 'missing-target',
          message: `${targetKind} target ${targetAddress} requires runtime resolution after a lazy route is loaded.`,
          blocking: false,
          eventId: sourceEvent.id,
          ...(sourceEvent.operationId
            ? { operationId: sourceEvent.operationId }
            : {}),
        });
      else if (resolution === 'ambiguous')
        issues.push({
          code: 'ambiguous-target',
          message: `${targetKind} target ${targetAddress} resolves to more than one current target.`,
          eventId: sourceEvent.id,
          ...(sourceEvent.operationId
            ? { operationId: sourceEvent.operationId }
            : {}),
        });
    }

    const operationId = sourceEvent.operationId ?? `replay:${step.id}`;
    const relatedEvents = sourceEvent.operationId
      ? events.filter((event) => event.operationId === sourceEvent.operationId)
      : sourceEvent.correlationId
        ? events.filter(
            (event) => event.correlationId === sourceEvent.correlationId,
          )
        : [];
    const expectedEvents = [
      ...new Map(
        [...interval, ...relatedEvents].map((event) => [event.id, event]),
      ).values(),
    ];
    const expected = expectedEvents
      .filter((event) => event.id !== sourceEvent.id && event.id !== step.id)
      .filter((event) =>
        sourceEvent.operationId
          ? event.operationId === sourceEvent.operationId ||
            (sourceEvent.correlationId !== undefined &&
              event.correlationId === sourceEvent.correlationId)
          : step.correlationId !== undefined &&
            event.correlationId === step.correlationId,
      )
      .map(asObservation);
    const startedOperations = [...interval, ...relatedEvents].filter(
      (event) =>
        event.phase === 'started' &&
        ['http', 'navigation', 'route-load', 'async-process'].includes(
          event.kind,
        ) &&
        event.operationId,
    );
    for (const started of startedOperations) {
      if (
        !events.some(
          (event) =>
            event.operationId === started.operationId &&
            ['succeeded', 'failed'].includes(event.phase),
        )
      )
        issues.push({
          code: 'missing-result',
          message: `Operation ${started.operationId} has no recorded terminal result.`,
          eventId: started.id,
          operationId: started.operationId,
        });
    }

    const participant = step.participantId ?? '';
    const dependsOn = previousByParticipant.get(participant);
    const commandId = `command:${step.id}`;
    const parentOperationId = invocation?.parentOperationId;
    const parentCommand = parentOperationId
      ? commandIdsByOperation.get(parentOperationId)
      : undefined;
    const parentIsReplayableInvocation =
      parentOperationId !== undefined &&
      events.some(
        (event) =>
          event.operationId === parentOperationId && replayInvocation(event),
      );
    if (parentOperationId && parentIsReplayableInvocation && !parentCommand)
      issues.push({
        code: 'missing-dependency',
        message: `Command ${commandId} depends on missing operation ${parentOperationId}.`,
        eventId: sourceEvent.id,
        operationId: parentOperationId,
      });
    const dependencies = [
      ...new Set(
        [dependsOn, parentCommand, restartCommandId].filter(
          (value): value is string => value !== undefined,
        ),
      ),
    ];
    commands.push({
      id: commandId,
      operationId,
      kind,
      sequence: step.sequence,
      atMs: eventTime(step),
      ...(participant ? { participantId: participant } : {}),
      dependsOn: dependencies,
      payload,
      expected,
    });
    for (const operation of [
      sourceEvent,
      ...interval.filter((candidate) => replayInvocation(candidate)),
    ])
      if (operation.operationId)
        commandIdsByOperation.set(operation.operationId, commandId);
    previousByParticipant.set(participant, commandId);
  }

  for (const event of events) {
    if (
      event.kind === 'transport' &&
      isRecord(event.payload) &&
      event.payload['replayable'] !== true
    )
      issues.push({
        code: 'unsupported-transport',
        message: `Transport event ${event.id} cannot be replayed: ${String(event.payload['reason'] ?? 'unsupported data')}.`,
        eventId: event.id,
        ...(event.operationId ? { operationId: event.operationId } : {}),
      });
  }

  const uniqueIssues = [
    ...new Map(
      issues.map((issue) => [
        `${issue.code}:${issue.eventId}:${issue.operationId}`,
        issue,
      ]),
    ).values(),
  ];
  return {
    version: 1,
    status:
      uniqueIssues.length === 0
        ? 'replayable'
        : commands.length === 0
          ? 'unreplayable'
          : 'partial',
    commands,
    observations,
    issues: uniqueIssues,
  };
}

function isReplayCommandEvent(event: SendContextEvent): boolean {
  if (event.kind === 'defer' && event.phase === 'started') return true;
  if (
    event.phase === 'emitted' &&
    ['dom', 'gesture', 'hover', 'scroll', 'viewport'].includes(event.kind)
  )
    return true;
  return false;
}

function hasUnreplayableValue(value: unknown): boolean {
  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  )
    return true;
  if (Array.isArray(value)) return value.some(hasUnreplayableValue);
  if (isRecord(value)) return Object.values(value).some(hasUnreplayableValue);
  return false;
}

export function validateReplaySnapshot(
  value: unknown,
):
  | Readonly<{ ok: true; snapshot: ReplaySnapshotV1 }>
  | Readonly<{ ok: false; error: string }> {
  if (!isRecord(value) || value['format'] !== 'craft-debug-replay-snapshot')
    return { ok: false, error: 'Snapshot format is not supported.' };
  if (value['version'] !== 1)
    return { ok: false, error: 'Snapshot version is not supported.' };
  if (
    typeof value['appVersion'] !== 'string' ||
    typeof value['capturedAt'] !== 'number' ||
    !Number.isFinite(value['capturedAt']) ||
    !isRecord(value['route']) ||
    typeof value['route']['url'] !== 'string' ||
    !isRecord(value['primitives']) ||
    !Array.isArray(value['storage']) ||
    !isRecord(value['capabilities']) ||
    value['capabilities']['primitives'] !== true ||
    value['capabilities']['storage'] !== true ||
    value['capabilities']['inFlightOperations'] !== false
  )
    return {
      ok: false,
      error: 'Snapshot is incomplete or does not describe restorable state.',
    };
  if (
    containsRedactedValue(value['primitives']) ||
    containsRedactedValue(value['storage'])
  )
    return {
      ok: false,
      error:
        'Snapshot contains redacted values and cannot be a reliable restart point.',
    };
  if (
    value['storage'].some(
      (entry) =>
        !isRecord(entry) ||
        typeof entry['backend'] !== 'string' ||
        typeof entry['storeName'] !== 'string' ||
        typeof entry['key'] !== 'string' ||
        !['query', 'queryById'].includes(String(entry['kind'])) ||
        !('value' in entry),
    )
  )
    return { ok: false, error: 'Snapshot contains an invalid storage entry.' };
  return { ok: true, snapshot: value as unknown as ReplaySnapshotV1 };
}

function containsRedactedValue(value: unknown): boolean {
  if (value === '[REDACTED]') return true;
  if (typeof value === 'string') return value.includes('[REDACTED]');
  if (Array.isArray(value)) return value.some(containsRedactedValue);
  if (isRecord(value)) return Object.values(value).some(containsRedactedValue);
  return false;
}

export type ReplayCommandExecutor = (
  command: ReplayCommand,
) =>
  | void
  | Readonly<{ operationId?: string }>
  | Promise<void | Readonly<{ operationId?: string }>>;

export type ReplayOrchestratorResult = Readonly<{
  status: 'completed' | 'failed';
  commandId?: string;
  error?: string;
  completed: readonly string[];
}>;

/** Execute a compiled plan through application-owned adapters and wait for its barriers. */
export async function executeReplayPlan(
  plan: ReplayPlan,
  options: Readonly<{
    execute: ReplayCommandExecutor;
    observations: () => readonly SendContextEvent[];
    /** Commands completed before a resumed or single-command execution. */
    completedCommandIds?: readonly string[];
    advanceTo?: (atMs: number) => void | Promise<void>;
    timeoutMs?: number;
  }>,
): Promise<ReplayOrchestratorResult> {
  if (
    plan.status === 'unreplayable' ||
    plan.issues.some((issue) => issue.blocking !== false)
  )
    return {
      status: 'failed',
      error: `Replay plan preflight failed: ${plan.issues.map((issue) => issue.message).join(' ')}`,
      completed: [],
    };
  const completed = new Set(options.completedCommandIds ?? []);
  const replayOperationIds = new Map<string, string>();
  const timeoutMs = options.timeoutMs ?? 5_000;
  const ordered = [...plan.commands].sort(
    (a, b) => a.atMs - b.atMs || a.sequence - b.sequence,
  );
  const pending = ordered.filter((command) => !completed.has(command.id));
  while (pending.length > 0) {
    const firstReadyIndex = pending.findIndex((command) =>
      command.dependsOn.every((dependency) => completed.has(dependency)),
    );
    if (firstReadyIndex < 0) {
      const blocked = pending[0]!;
      const missing = blocked.dependsOn.find(
        (dependency) => !completed.has(dependency),
      );
      return {
        status: 'failed',
        commandId: blocked.id,
        error: missing
          ? `Command ${blocked.id} cannot run before ${missing}.`
          : `Replay plan contains a dependency cycle at ${blocked.id}.`,
        completed: [...completed],
      };
    }
    const ready = pending[firstReadyIndex]!;
    const batch = pending.filter(
      (command) =>
        command.atMs === ready.atMs &&
        command.dependsOn.every((dependency) => completed.has(dependency)),
    );
    try {
      await options.advanceTo?.(ready.atMs);
      const executions = await Promise.all(
        batch.map((command) => options.execute(command)),
      );
      batch.forEach((command, index) => {
        const operationId = executions[index]?.operationId;
        if (operationId)
          replayOperationIds.set(command.operationId, operationId);
      });
      await Promise.all(
        batch.map(async (command) => {
          const expected = command.expected.filter(isTerminalObservation);
          const deadline = Date.now() + timeoutMs;
          while (
            !expected.every((item) =>
              observationSatisfied(
                item,
                options.observations(),
                replayOperationIds,
              ),
            )
          ) {
            if (Date.now() >= deadline)
              throw new Error(
                `Timed out waiting for observations of ${command.id}.`,
              );
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
          }
        }),
      );
      for (const command of batch) {
        completed.add(command.id);
        pending.splice(
          pending.findIndex((candidate) => candidate.id === command.id),
          1,
        );
      }
    } catch (error) {
      return {
        status: 'failed',
        commandId: ready.id,
        error: error instanceof Error ? error.message : String(error),
        completed: [...completed],
      };
    }
  }
  return { status: 'completed', completed: [...completed] };
}

function isTerminalObservation(observation: ReplayObservation): boolean {
  return (
    ['succeeded', 'failed'].includes(observation.phase) ||
    (observation.kind === 'route-load' && observation.phase !== 'started')
  );
}

function observationSatisfied(
  expected: ReplayObservation,
  actualEvents: readonly SendContextEvent[],
  replayOperationIds: ReadonlyMap<string, string>,
): boolean {
  const actualOperationId = expected.operationId
    ? replayOperationIds.get(expected.operationId)
    : undefined;
  return actualEvents.some((event) => {
    if (event.kind !== expected.kind || event.phase !== expected.phase)
      return false;
    if (actualOperationId && event.operationId !== actualOperationId)
      return false;
    return observationPayloadMatches(
      expected,
      event.payload,
      event.response,
      event.state,
      event.name,
    );
  });
}

/** Compare a recorded observation with runtime events without binding old operation IDs. */
export function replayObservationSatisfied(
  expected: ReplayObservation,
  actualEvents: readonly SendContextEvent[],
): boolean {
  return observationSatisfied(expected, actualEvents, new Map());
}

function observationPayloadMatches(
  expected: ReplayObservation,
  actualPayload: unknown,
  actualResponse: unknown,
  actualState: unknown,
  actualName: string | undefined,
): boolean {
  const expectedPayload = isRecord(expected.payload) ? expected.payload : {};
  const actual = isRecord(actualPayload) ? actualPayload : {};
  const keys =
    expected.kind === 'http'
      ? ['method', 'url', 'params', 'payload', 'outcome']
      : expected.kind === 'route-load'
        ? ['phase', 'routePath', 'targetUrl', 'outcome']
        : expected.kind === 'pending'
          ? ['source', 'mode', 'transition', 'fallbackRendered']
          : expected.kind === 'component-lifecycle'
            ? ['transition', 'componentName', 'routeUrl']
            : expected.kind === 'craft'
              ? ['host', 'replayInvocation']
              : Object.keys(expectedPayload);
  if (
    keys.some(
      (key) =>
        key in expectedPayload &&
        stableReplayJson(expectedPayload[key]) !==
          stableReplayJson(actual[key]),
    )
  )
    return false;
  if (
    expected.name !== undefined &&
    expected.name !== actualName &&
    expected.kind !== 'http'
  )
    return false;
  if (
    expected.response !== undefined &&
    stableReplayJson(expected.response) !== stableReplayJson(actualResponse)
  )
    return false;
  if (expected.state !== undefined)
    return stableReplayJson(expected.state) === stableReplayJson(actualState);
  return true;
}

function stableReplayJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableReplayJson).join(',')}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableReplayJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? String(value);
}
