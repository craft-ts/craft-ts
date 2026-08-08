import {
  DestroyRef,
  InjectionToken,
  inject,
  type Provider,
} from '@angular/core';

export const TEMPORAL_AWAIT_REQUEST_MARKER = Symbol(
  'temporal-await-request-marker',
);

export type TemporalTaskKind = 'sleep' | 'timeout' | 'schedule' | (string & {});

export type TemporalTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'cancelled';

export type TemporalTaskSnapshot = Readonly<{
  id: number;
  kind: TemporalTaskKind;
  dueAt: number;
  owner?: string;
  status: TemporalTaskStatus;
}>;

export type TemporalScheduleOptions = Readonly<{
  kind?: TemporalTaskKind;
  owner?: string;
  destroyRef?: DestroyRef;
  signal?: AbortSignal;
}>;

export type TemporalTaskHandle = Readonly<{
  id: number;
  cancel(): boolean;
  snapshot(): TemporalTaskSnapshot;
}>;

export interface CraftTemporalRuntime {
  /** Monotonic time used for durations and deadlines. */
  now(): number;

  /** Civil time, kept separate from the monotonic duration clock. */
  dateNow(): number;

  schedule(
    callback: () => void,
    delayMs: number,
    options?: TemporalScheduleOptions,
  ): TemporalTaskHandle;

  sleep(delayMs: number, options?: TemporalScheduleOptions): Promise<void>;

  pendingTasks(owner?: string): readonly TemporalTaskSnapshot[];

  cancelAll(owner?: string): void;
}

export type RuntimeTemporalAwaitRequest = Readonly<{
  [TEMPORAL_AWAIT_REQUEST_MARKER]: true;
  kind: 'sleep' | 'promise';
  delayMs: number;
  owner?: string;
  signal?: AbortSignal;
}>;

export function createTemporalSleepRequest(
  delayMs: number,
  owner?: string,
  signal?: AbortSignal,
): RuntimeTemporalAwaitRequest {
  assertDelay(delayMs);
  return {
    [TEMPORAL_AWAIT_REQUEST_MARKER]: true,
    kind: 'sleep',
    delayMs,
    ...(owner === undefined ? {} : { owner }),
    ...(signal === undefined ? {} : { signal }),
  };
}

export function isTemporalAwaitRequest(
  value: unknown,
): value is RuntimeTemporalAwaitRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    TEMPORAL_AWAIT_REQUEST_MARKER in value
  );
}

/**
 * Suspends an async Craft program for `delayMs`.
 *
 * This is intentionally a generator rather than a Promise factory. The
 * program driver can then replace the runtime clock in tests and can attach
 * the request to the lifetime of the injector that owns the program.
 */
export function craftSleep(
  delayMs: number,
  options: Readonly<{ owner?: string; signal?: AbortSignal }> = {},
): Generator<RuntimeTemporalAwaitRequest, void, unknown> {
  return (function* () {
    yield createTemporalSleepRequest(delayMs, options.owner, options.signal);
  })();
}

export type CraftTemporalScheduleContext = Readonly<{
  /** One-based number of the next retry/repeat attempt. */
  attempt: number;
  elapsedMs: number;
  input?: unknown;
  error?: unknown;
}>;

export type CraftTemporalScheduleDecision =
  | Readonly<{ done: true }>
  | Readonly<{ done: false; delayMs: number }>;

export interface CraftTemporalSchedule {
  next(context: CraftTemporalScheduleContext): CraftTemporalScheduleDecision;
}

export function fixedTemporalSchedule(
  delayMs: number,
  options: Readonly<{ maxAttempts?: number }> = {},
): CraftTemporalSchedule {
  assertDelay(delayMs);
  const maxAttempts = normalizeMaxAttempts(options.maxAttempts);
  return {
    next: ({ attempt }) =>
      attempt > maxAttempts ? { done: true } : { done: false, delayMs },
  };
}

export function exponentialTemporalSchedule(
  delayMs: number,
  options: Readonly<{
    factor?: number;
    maxAttempts?: number;
    maxDelayMs?: number;
  }> = {},
): CraftTemporalSchedule {
  assertDelay(delayMs);
  const factor = options.factor ?? 2;
  if (!Number.isFinite(factor) || factor < 1) {
    throw new RangeError(
      'Temporal schedule factor must be finite and at least 1.',
    );
  }
  const maxAttempts = normalizeMaxAttempts(options.maxAttempts);
  const maxDelayMs = options.maxDelayMs ?? Number.POSITIVE_INFINITY;
  if (maxDelayMs !== Number.POSITIVE_INFINITY) assertDelay(maxDelayMs);

  return {
    next: ({ attempt }) => {
      if (attempt > maxAttempts) return { done: true };
      return {
        done: false,
        delayMs: Math.min(
          maxDelayMs,
          delayMs * factor ** Math.max(0, attempt - 1),
        ),
      };
    },
  };
}

export function sequenceTemporalSchedule(
  delays: readonly number[],
): CraftTemporalSchedule {
  for (const delay of delays) assertDelay(delay);
  return {
    next: ({ attempt }) => {
      const delayMs = delays[attempt - 1];
      return delayMs === undefined ? { done: true } : { done: false, delayMs };
    },
  };
}

function normalizeMaxAttempts(value: number | undefined): number {
  const maxAttempts = value ?? Number.POSITIVE_INFINITY;
  if (
    maxAttempts !== Number.POSITIVE_INFINITY &&
    (!Number.isInteger(maxAttempts) || maxAttempts < 0)
  ) {
    throw new RangeError(
      'Temporal schedule maxAttempts must be a non-negative integer.',
    );
  }
  return maxAttempts;
}

export const CRAFT_TEMPORAL_RUNTIME = new InjectionToken<CraftTemporalRuntime>(
  'CRAFT_TEMPORAL_RUNTIME',
  {
    providedIn: 'root',
    factory: () => new RealCraftTemporalRuntime(),
  },
);

export function provideCraftTemporalRuntime(
  runtime: CraftTemporalRuntime,
): Provider {
  return { provide: CRAFT_TEMPORAL_RUNTIME, useValue: runtime };
}

export class CraftTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Craft operation timed out after ${timeoutMs}ms.`);
    this.name = 'CraftTimeoutError';
  }
}

/** Races an operation against the injected (or explicitly supplied) clock. */
export function withCraftTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  options: Readonly<{
    runtime?: CraftTemporalRuntime;
    owner?: string;
    destroyRef?: DestroyRef;
  }> = {},
): Promise<T> {
  assertDelay(timeoutMs);
  const runtime =
    options.runtime ??
    tryInjectTemporalRuntime() ??
    new RealCraftTemporalRuntime();

  return new Promise<T>((resolve, reject) => {
    const timeout = runtime.schedule(
      () => reject(new CraftTimeoutError(timeoutMs)),
      timeoutMs,
      {
        kind: 'timeout',
        owner: options.owner,
        destroyRef: options.destroyRef,
      },
    );

    Promise.resolve(operation).then(
      (value) => {
        timeout.cancel();
        resolve(value);
      },
      (error: unknown) => {
        timeout.cancel();
        reject(error);
      },
    );
  });
}

function tryInjectTemporalRuntime(): CraftTemporalRuntime | undefined {
  try {
    return inject(CRAFT_TEMPORAL_RUNTIME, { optional: true }) ?? undefined;
  } catch {
    return undefined;
  }
}

class TemporalTask implements TemporalTaskHandle {
  private _status: TemporalTaskStatus = 'pending';
  private readonly cancelListeners = new Set<() => void>();

  constructor(
    readonly id: number,
    private readonly dueAt: number,
    private readonly kind: TemporalTaskKind,
    private readonly owner: string | undefined,
    readonly callback: () => void,
    private readonly onCancel: () => void,
    private readonly onComplete: () => void,
  ) {}

  cancel(): boolean {
    if (this._status === 'completed' || this._status === 'cancelled') {
      return false;
    }

    this._status = 'cancelled';
    this.onCancel();
    for (const listener of this.cancelListeners) listener();
    return true;
  }

  onCancelled(listener: () => void): void {
    if (this._status === 'cancelled') {
      listener();
      return;
    }
    this.cancelListeners.add(listener);
  }

  snapshot(): TemporalTaskSnapshot {
    return {
      id: this.id,
      kind: this.kind,
      dueAt: this.dueAt,
      ...(this.owner === undefined ? {} : { owner: this.owner }),
      status: this._status,
    };
  }

  markRunning(): boolean {
    if (this._status !== 'pending') return false;
    this._status = 'running';
    return true;
  }

  markCompleted(): void {
    if (this._status === 'running') {
      this._status = 'completed';
      this.onComplete();
    }
  }
}

type TrackedTask = TemporalTask;

abstract class BaseCraftTemporalRuntime implements CraftTemporalRuntime {
  protected readonly tasks = new Map<number, TrackedTask>();
  private nextId = 1;

  abstract now(): number;

  dateNow(): number {
    return Date.now();
  }

  protected createTask(
    callback: () => void,
    delayMs: number,
    options: TemporalScheduleOptions,
  ): TrackedTask {
    assertDelay(delayMs);
    const id = this.nextId++;
    const destroyRef = options.destroyRef;
    const signal = options.signal;
    let removeAbortListener: () => void = () => undefined;

    const task = new TemporalTask(
      id,
      this.now() + delayMs,
      options.kind ?? 'schedule',
      options.owner,
      callback,
      () => {
        removeAbortListener();
        this.tasks.delete(id);
      },
      () => removeAbortListener(),
    );

    this.tasks.set(id, task);

    if (signal) {
      const abort = () => task.cancel();
      signal.addEventListener('abort', abort, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', abort);
      if (signal.aborted) task.cancel();
    }

    destroyRef?.onDestroy(() => task.cancel());
    return task;
  }

  schedule(
    callback: () => void,
    delayMs: number,
    options: TemporalScheduleOptions = {},
  ): TemporalTaskHandle {
    return this.createTask(callback, delayMs, options);
  }

  sleep(delayMs: number, options: TemporalScheduleOptions = {}): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const { destroyRef, ...scheduleOptions } = options;
      const task = this.schedule(
        () => {
          if (settled) return;
          settled = true;
          resolve();
        },
        delayMs,
        { ...scheduleOptions, kind: options.kind ?? 'sleep' },
      );

      if (task instanceof TemporalTask) {
        task.onCancelled(() => {
          if (!settled) {
            settled = true;
            reject(new TemporalCancelledError());
          }
        });
      }

      destroyRef?.onDestroy(() => {
        task.cancel();
      });
    });
  }

  pendingTasks(owner?: string): readonly TemporalTaskSnapshot[] {
    return [...this.tasks.values()]
      .filter(
        (task) =>
          task.snapshot().status === 'pending' &&
          (owner === undefined || task.snapshot().owner === owner),
      )
      .sort(compareTasks)
      .map((task) => task.snapshot());
  }

  cancelAll(owner?: string): void {
    for (const task of [...this.tasks.values()]) {
      if (owner === undefined || task.snapshot().owner === owner) {
        task.cancel();
      }
    }
  }

  protected takeNextDueTask(limit: number): TrackedTask | undefined {
    return [...this.tasks.values()]
      .filter(
        (task) =>
          task.snapshot().status === 'pending' &&
          task.snapshot().dueAt <= limit,
      )
      .sort(compareTasks)[0];
  }

  protected runTask(task: TrackedTask): void {
    if (!task.markRunning()) return;
    try {
      task.callback();
    } finally {
      task.markCompleted();
      this.tasks.delete(task.id);
    }
  }
}

/** Runtime adapter backed by the host's native timer APIs. */
export class RealCraftTemporalRuntime extends BaseCraftTemporalRuntime {
  private readonly nativeTimers = new Map<
    number,
    ReturnType<typeof setTimeout>
  >();

  now(): number {
    return typeof globalThis.performance?.now === 'function'
      ? globalThis.performance.now()
      : Date.now();
  }

  override schedule(
    callback: () => void,
    delayMs: number,
    options: TemporalScheduleOptions = {},
  ): TemporalTaskHandle {
    const task = super.schedule(callback, delayMs, options) as TemporalTask;
    if (task.snapshot().status === 'cancelled') return task;
    const nativeTimer = setTimeout(() => {
      this.nativeTimers.delete(task.id);
      this.runTask(task as TrackedTask);
    }, delayMs);
    this.nativeTimers.set(task.id, nativeTimer);

    const cancel = task.cancel.bind(task);
    task.cancel = () => {
      const cancelled = cancel();
      if (cancelled) {
        const timer = this.nativeTimers.get(task.id);
        if (timer !== undefined) clearTimeout(timer);
        this.nativeTimers.delete(task.id);
      }
      return cancelled;
    };
    return task;
  }
}

/**
 * Deterministic adapter for tests. It never waits for wall-clock time.
 * Equal deadlines are executed in creation order.
 */
export class VirtualCraftTemporalRuntime extends BaseCraftTemporalRuntime {
  private currentTime: number;

  constructor(initialTime = 0) {
    super();
    assertFiniteTime(initialTime, 'initialTime');
    this.currentTime = initialTime;
  }

  now(): number {
    return this.currentTime;
  }

  override dateNow(): number {
    return this.currentTime;
  }

  async advanceBy(milliseconds: number): Promise<void> {
    assertDelay(milliseconds);
    await this.advanceTo(this.currentTime + milliseconds);
  }

  async advanceTo(time: number): Promise<void> {
    assertFiniteTime(time, 'time');
    if (time < this.currentTime) {
      throw new RangeError('Virtual time cannot move backwards.');
    }

    for (;;) {
      const task = this.takeNextDueTask(time);
      if (!task) break;
      this.currentTime = task.snapshot().dueAt;
      this.runTask(task);
      await Promise.resolve();
    }

    this.currentTime = time;
    await Promise.resolve();
  }

  async advanceToNextTask(): Promise<boolean> {
    const next = this.pendingTasks()[0];
    if (!next) return false;
    await this.advanceTo(next.dueAt);
    return true;
  }

  async runUntilIdle(maxTasks = 10_000): Promise<void> {
    let count = 0;
    while (await this.advanceToNextTask()) {
      count += 1;
      if (count > maxTasks) {
        throw new Error(
          `Virtual temporal runtime exceeded ${maxTasks} tasks without becoming idle.`,
        );
      }
    }
  }

  reset(time = 0): void {
    assertFiniteTime(time, 'time');
    this.cancelAll();
    this.currentTime = time;
  }
}

export class TemporalCancelledError extends Error {
  constructor() {
    super('The Craft temporal task was cancelled.');
    this.name = 'TemporalCancelledError';
  }
}

function assertDelay(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `Temporal delay must be a finite non-negative number; received ${value}.`,
    );
  }
}

function assertFiniteTime(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Virtual ${name} must be finite; received ${value}.`);
  }
}

function compareTasks(
  left: TemporalTaskHandle,
  right: TemporalTaskHandle,
): number {
  const leftSnapshot = left.snapshot();
  const rightSnapshot = right.snapshot();
  return (
    leftSnapshot.dueAt - rightSnapshot.dueAt ||
    leftSnapshot.id - rightSnapshot.id
  );
}
