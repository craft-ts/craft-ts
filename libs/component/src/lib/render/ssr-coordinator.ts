import {
  CraftSsrTimeoutError,
  CraftUnhandledSsrResolutionError,
  type SsrMode,
  type CraftSsrRuntime,
} from '@craft-ts/core';

export class CraftSsrCoordinator implements CraftSsrRuntime {
  private readonly pending = new Map<
    object,
    { readonly source: string; readonly timer?: ReturnType<typeof setTimeout> }
  >();
  private readonly listeners = new Set<() => void>();
  private failure: unknown;
  private readonly decideResource:
    | ((source: string, mode: SsrMode) => void)
    | undefined;
  private readonly defaultTimeoutMs: number | undefined;

  constructor(
    decideResource?: (source: string, mode: SsrMode) => void,
    defaultTimeoutMs?: number,
  ) {
    this.decideResource = decideResource;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  suspend(
    token: object,
    source: string,
    mode: SsrMode | undefined,
    options: Readonly<{ route?: string; timeoutMs?: number }> = {},
  ): void {
    if (mode === undefined) {
      throw new CraftUnhandledSsrResolutionError(source, options.route);
    }
    this.decideResource?.(source, mode);
    if (mode !== 'block') return;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const timer =
      timeoutMs !== undefined
        ? setTimeout(() => {
            this.failure ??= new CraftSsrTimeoutError(timeoutMs, [source]);
            this.resume(token);
          }, timeoutMs)
        : undefined;
    this.pending.set(token, { source, ...(timer ? { timer } : {}) });
  }

  resume(token: object): void {
    const entry = this.pending.get(token);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.pending.delete(token);
    for (const listener of [...this.listeners]) listener();
  }

  track(source: string, work: PromiseLike<unknown>): void {
    const token = {};
    this.pending.set(token, { source });
    Promise.resolve(work).then(
      () => this.resume(token),
      (error) => {
        this.failure ??= error;
        this.resume(token);
      },
    );
  }

  unhandled(source: string, route?: string): never {
    throw new CraftUnhandledSsrResolutionError(source, route);
  }

  async untilSettled(timeoutMs: number, signal?: AbortSignal): Promise<void> {
    const startedAt = Date.now();
    while (this.pending.size > 0) {
      this.throwFailure();
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0) {
        throw new CraftSsrTimeoutError(timeoutMs, this.sources());
      }
      await this.nextChange(remaining, signal);
    }
    this.throwFailure();
  }

  sources(): readonly string[] {
    return [
      ...new Set([...this.pending.values()].map((entry) => entry.source)),
    ];
  }

  /** Releases source timers and waiters when the request is aborted. */
  dispose(): void {
    for (const entry of this.pending.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.pending.clear();
    this.listeners.clear();
  }

  private throwFailure(): void {
    if (this.failure === undefined) return;
    const failure = this.failure;
    this.failure = undefined;
    throw failure;
  }

  private nextChange(timeoutMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const done = () => {
        cleanup();
        resolve();
      };
      const aborted = () => {
        cleanup();
        this.dispose();
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new CraftSsrTimeoutError(timeoutMs, this.sources()));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(done);
        signal?.removeEventListener('abort', aborted);
      };
      if (signal?.aborted) {
        aborted();
        return;
      }
      this.listeners.add(done);
      signal?.addEventListener('abort', aborted, { once: true });
    });
  }
}
