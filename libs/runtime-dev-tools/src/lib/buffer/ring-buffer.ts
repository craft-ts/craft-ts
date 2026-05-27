import { Injectable, InjectionToken, signal, type Signal } from '@angular/core';
import type { DevToolsEvent } from '../event-types';

/**
 * Stores events in a mutable array and exposes them via a signal that is
 * updated asynchronously via `setTimeout`.
 *
 * Why setTimeout and not queueMicrotask:
 * - queueMicrotask runs in the SAME tick as the wrapper's emission. If a CD
 *   cycle reads a primitive that emits events, the microtask flush fires
 *   inside that tick, sets the signal, schedules another CD, the new CD
 *   re-reads primitives → tight loop counted by Angular as NG0103 (endless
 *   change notifications).
 * - setTimeout fires in a new task, so each flush is in a different tick and
 *   the NG0103 counter resets between flushes. We also throttle to 100ms to
 *   keep CD churn low even under heavy event traffic.
 *
 * The mutable internal array is updated synchronously — only the signal
 * publication is deferred. Snapshot reads via `snapshot()` always see the
 * latest data without waiting for the flush.
 */
@Injectable()
export class DevToolsRingBuffer {
  private static readonly FLUSH_INTERVAL_MS = 100;

  private _capacity = 500;
  private readonly _buffer: DevToolsEvent[] = [];
  private readonly _events = signal<readonly DevToolsEvent[]>([]);
  private _flushHandle: ReturnType<typeof setTimeout> | null = null;
  /**
   * Re-entrancy guard: if a flush callback writing the signal kicks off CD
   * which in turn triggers more wrapper events, we still accept them into the
   * buffer but never re-enter the flush callback synchronously.
   */
  private _isFlushing = false;

  readonly events: Signal<readonly DevToolsEvent[]> = this._events.asReadonly();

  setCapacity(capacity: number): void {
    this._capacity = capacity;
    if (this._buffer.length > capacity) {
      this._buffer.splice(0, this._buffer.length - capacity);
      this._scheduleFlush();
    }
  }

  push(event: DevToolsEvent): void {
    this._buffer.push(event);
    if (this._buffer.length > this._capacity) {
      this._buffer.splice(0, this._buffer.length - this._capacity);
    }
    this._scheduleFlush();
  }

  clear(): void {
    this._buffer.length = 0;
    this._scheduleFlush();
  }

  /** Read-only snapshot of the underlying buffer (always up-to-date). */
  snapshot(): readonly DevToolsEvent[] {
    return [...this._buffer];
  }

  private _scheduleFlush(): void {
    if (this._flushHandle !== null) return;
    this._flushHandle = setTimeout(() => {
      this._flushHandle = null;
      if (this._isFlushing) return;
      this._isFlushing = true;
      try {
        this._events.set([...this._buffer]);
      } finally {
        this._isFlushing = false;
      }
    }, DevToolsRingBuffer.FLUSH_INTERVAL_MS);
  }

  /** Test helper: flush synchronously, bypassing the timer. */
  ɵflushForTests(): void {
    if (this._flushHandle !== null) {
      clearTimeout(this._flushHandle);
      this._flushHandle = null;
    }
    this._events.set([...this._buffer]);
  }
}

export const DEV_TOOLS_BUFFER = new InjectionToken<DevToolsRingBuffer>(
  'DEV_TOOLS_BUFFER',
);
