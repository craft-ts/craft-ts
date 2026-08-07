import {
  computed,
  inject,
  Injector,
  InjectionToken,
  signal,
  type Signal,
} from '@angular/core';
import { SERVICE_YIELD_REQUEST_MARKER } from './craft-generator-runtime';
import type { ConcreteServiceScope } from './craft-service.shared';

/** A human-readable prefix describing the operation that started a flow. */
export type CorrelationIdPrefix =
  | 'click'
  | 'enter'
  | 'nav-back'
  | 'nav-forward'
  | (string & {});

export interface CorrelationIdMetadata {
  lastCorrelationId: string | null;
  mayCorrelatedIds: readonly string[];
  startCorrelationId: string | null;
}

export interface CorrelationIdServiceApi {
  readonly lastCorrelationId: Signal<string | null>;
  readonly mayCorrelatedIds: Signal<readonly string[]>;
  generateAndSet(prefix: CorrelationIdPrefix): string;
  startOperation(id: string): void;
  endOperation(id: string): void;
}

export const CORRELATION_ID_SERVICE = new InjectionToken<
  CorrelationIdServiceApi | null
>('CORRELATION_ID_SERVICE', {
  providedIn: 'root',
  factory: () => null,
});

export function createCorrelationIdService(): CorrelationIdServiceApi {
  const _lastCorrelationId = signal<string | null>(null);
  const _inFlightIds = signal<ReadonlySet<string>>(new Set());
  const _mayCorrelatedIds = computed(() => [..._inFlightIds()]);
  const _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function generateAndSet(prefix: CorrelationIdPrefix): string {
    const id = `${prefix}:${generateUUID()}`;
    _lastCorrelationId.set(id);
    return id;
  }

  function startOperation(id: string): void {
    const existingTimer = _debounceTimers.get(id);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      _debounceTimers.delete(id);
    }
    _inFlightIds.update((s) => new Set([...s, id]));
  }

  function endOperation(id: string): void {
    const timer = setTimeout(() => {
      _debounceTimers.delete(id);
      _inFlightIds.update((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }, 500);
    _debounceTimers.set(id, timer);
  }

  return {
    lastCorrelationId: _lastCorrelationId.asReadonly(),
    mayCorrelatedIds: _mayCorrelatedIds,
    generateAndSet,
    startOperation,
    endOperation,
  };
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Module-level variable tracking startCorrelationId within a generator execution.
// JavaScript is single-threaded: safe to use as a call-stack variable.
// Set by the CorrelationId FnWrapper before the generator runs, reset after.
let _currentStartCorrelationId: string | null = null;

export function setCurrentStartCorrelationId(id: string | null): void {
  _currentStartCorrelationId = id;
}

export function getCurrentStartCorrelationId(): string | null {
  return _currentStartCorrelationId;
}

export type CorrelationIdYield = Readonly<{
  [SERVICE_YIELD_REQUEST_MARKER]: true;
  scope: 'function';
  resolve: (
    injector: Injector,
    hostScope: ConcreteServiceScope,
  ) => CorrelationIdMetadata;
}>;

export function* CorrelationId(): Generator<
  CorrelationIdYield,
  CorrelationIdMetadata,
  unknown
> {
  return (yield {
    [SERVICE_YIELD_REQUEST_MARKER]: true,
    scope: 'function' as const,
    resolve: (injector: Injector) => {
      const service = injector.get(CORRELATION_ID_SERVICE, null);
      return {
        lastCorrelationId: service?.lastCorrelationId() ?? null,
        mayCorrelatedIds: service?.mayCorrelatedIds() ?? [],
        startCorrelationId: _currentStartCorrelationId,
      };
    },
  }) as CorrelationIdMetadata;
}

export function injectCorrelationIdService(): CorrelationIdServiceApi | null {
  return inject(CORRELATION_ID_SERVICE);
}
