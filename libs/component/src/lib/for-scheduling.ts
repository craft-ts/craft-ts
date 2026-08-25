import { InjectionToken } from './host-runtime';
import { craftDirective } from './directive';
import type { CraftDirective } from './types';

export type ForScheduleStrategy = 'sync' | 'frame';

export interface ForScheduleOptions {
  readonly enabled?: boolean;
  readonly strategy?: ForScheduleStrategy;
  readonly frameBudgetMs?: number;
}

export interface ForSchedulePolicy {
  readonly enabled: boolean;
  readonly strategy: ForScheduleStrategy;
  readonly frameBudgetMs: number;
}

export const SCHEDULE_FOR_DIRECTIVE = Symbol('schedule-for-directive');

export type ScheduleForDirective<
  Policy extends ForSchedulePolicy = ForSchedulePolicy,
> = CraftDirective & {
  readonly [SCHEDULE_FOR_DIRECTIVE]: Policy;
};

type NormalizedPolicy<Options extends ForScheduleOptions> = {
  readonly enabled: Options['enabled'] extends false ? false : true;
  readonly strategy: Options['strategy'] extends ForScheduleStrategy
    ? Options['strategy']
    : 'frame';
  readonly frameBudgetMs: Options['frameBudgetMs'] extends number
    ? Options['frameBudgetMs']
    : 4;
};

/**
 * Adds progressive rendering metadata to an `each` block.
 *
 * This is registered through the normal Craft directive factory so it remains
 * part of the directive authoring model. The renderer recognizes the marker
 * before the generic directive path, so its identity does not imply a DOM
 * wrapper or a CraftDirectiveRenderedNode.
 */
export function scheduleFor<const Options extends ForScheduleOptions>(
  options: Options = {} as Options,
): ScheduleForDirective<NormalizedPolicy<Options>> {
  const frameBudgetMs =
    typeof options.frameBudgetMs === 'number' && options.frameBudgetMs > 0
      ? options.frameBudgetMs
      : 4;
  const policy = {
    enabled: options.enabled !== false,
    strategy: options.strategy ?? 'frame',
    frameBudgetMs,
  } as NormalizedPolicy<Options>;

  const directive = craftDirective(
    'scheduleFor',
    {},
    (baseLogic) => baseLogic,
    (baseTemplate) => baseTemplate,
  ) as ScheduleForDirective<NormalizedPolicy<Options>>;
  Object.defineProperty(directive, SCHEDULE_FOR_DIRECTIVE, {
    value: Object.freeze(policy),
    enumerable: false,
  });
  return directive;
}

export interface CancelHandle {
  cancel(): void;
}

export interface ForScheduler {
  schedule(task: () => void): CancelHandle;
}

/** Injectable override used by deterministic tests and host integrations. */
export const FOR_SCHEDULER = new InjectionToken<ForScheduler>(
  'FOR_SCHEDULER',
);

const NOOP_CANCEL: CancelHandle = { cancel: () => undefined };

export class SyncForScheduler implements ForScheduler {
  schedule(task: () => void): CancelHandle {
    task();
    return NOOP_CANCEL;
  }
}

type QueuedTask = {
  readonly task: () => void;
  cancelled: boolean;
};

export class FrameForScheduler implements ForScheduler {
  private readonly queue: QueuedTask[] = [];
  private frame: number | ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;
  private readonly frameBudgetMs: number;

  constructor(frameBudgetMs = 4) {
    this.frameBudgetMs = frameBudgetMs;
  }

  schedule(task: () => void): CancelHandle {
    if (this.destroyed) return NOOP_CANCEL;

    const queued: QueuedTask = { task, cancelled: false };
    this.queue.push(queued);
    this.requestFrame();
    return {
      cancel: () => {
        queued.cancelled = true;
      },
    };
  }

  destroy(): void {
    this.destroyed = true;
    this.queue.length = 0;
    if (this.frame !== undefined) {
      this.cancelFrame(this.frame);
      this.frame = undefined;
    }
  }

  private requestFrame(): void {
    if (this.frame !== undefined || this.destroyed || this.queue.length === 0) {
      return;
    }

    const request = globalThis.requestAnimationFrame;
    if (typeof request === 'function') {
      this.frame = request(() => {
        this.frame = undefined;
        this.flush();
      });
      return;
    }

    this.frame = globalThis.setTimeout(() => {
      this.frame = undefined;
      this.flush();
    }, 16);
  }

  private flush(): void {
    const started = now();
    while (this.queue.length > 0) {
      const queued = this.queue.shift();
      if (!queued) break;
      if (!queued.cancelled) queued.task();
      if (now() - started >= this.frameBudgetMs) break;
    }
    this.requestFrame();
  }

  private cancelFrame(frame: number | ReturnType<typeof setTimeout>): void {
    if (typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(frame as number);
    } else {
      globalThis.clearTimeout(frame as ReturnType<typeof setTimeout>);
    }
  }
}

function now(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

export function createForScheduler(
  policy: ForSchedulePolicy,
): ForScheduler & { destroy?(): void } {
  if (!policy.enabled || policy.strategy === 'sync') {
    return new SyncForScheduler();
  }
  return new FrameForScheduler(policy.frameBudgetMs);
}

export function isScheduleForDirective(
  value: unknown,
): value is ScheduleForDirective {
  return (
    (typeof value === 'function' ||
      (typeof value === 'object' && value !== null)) &&
    SCHEDULE_FOR_DIRECTIVE in value
  );
}
