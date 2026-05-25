import { Injectable, InjectionToken } from '@angular/core';
import { Subject } from 'rxjs';
import type { DevToolsEvent } from './event-types';

@Injectable()
export class DevToolsEventBus {
  readonly events$ = new Subject<DevToolsEvent>();

  emit(event: DevToolsEvent): void {
    this.events$.next(event);
  }
}

export const DEV_TOOLS_EVENT_BUS = new InjectionToken<DevToolsEventBus>(
  'DEV_TOOLS_EVENT_BUS',
);
