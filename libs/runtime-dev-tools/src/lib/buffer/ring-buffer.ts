import { Injectable, InjectionToken, signal, type Signal } from '@angular/core';
import type { DevToolsEvent } from '../event-types';

@Injectable()
export class DevToolsRingBuffer {
  private _capacity = 500;
  private readonly _events = signal<readonly DevToolsEvent[]>([]);

  readonly events: Signal<readonly DevToolsEvent[]> = this._events.asReadonly();

  setCapacity(capacity: number): void {
    this._capacity = capacity;
    const current = this._events();
    if (current.length > capacity) {
      this._events.set(current.slice(current.length - capacity));
    }
  }

  push(event: DevToolsEvent): void {
    const current = this._events();
    const next = current.length >= this._capacity
      ? [...current.slice(current.length - this._capacity + 1), event]
      : [...current, event];
    this._events.set(next);
  }

  clear(): void {
    this._events.set([]);
  }
}

export const DEV_TOOLS_BUFFER = new InjectionToken<DevToolsRingBuffer>(
  'DEV_TOOLS_BUFFER',
);
