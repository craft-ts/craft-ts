import {
  APP_INITIALIZER,
  ApplicationRef,
  createComponent,
  EnvironmentInjector,
  inject,
  type Provider,
} from '@angular/core';
import {
  DEV_TOOLS_BUFFER,
  DevToolsRingBuffer,
} from './buffer/ring-buffer';
import {
  provideFnWrapperCollector,
  type FnWrapperCollectorOptions,
} from './collectors/fn-wrapper-collector';
import {
  DEV_TOOLS_EVENT_BUS,
  DevToolsEventBus,
} from './event-bus';
import { CraftDevToolsPanelComponent } from './ui/dev-tools-panel.component';

export interface CraftDevToolsOptions extends FnWrapperCollectorOptions {
  /** Max number of events kept in the ring buffer. Default: 500. */
  readonly bufferSize?: number;
  /** Auto-mount the floating panel into document.body. Default: true. */
  readonly autoMount?: boolean;
}

export function provideCraftDevTools(
  options: CraftDevToolsOptions = {},
): Provider[] {
  const bufferSize = options.bufferSize ?? 500;
  const autoMount = options.autoMount ?? true;

  const providers: Provider[] = [
    { provide: DEV_TOOLS_EVENT_BUS, useClass: DevToolsEventBus },
    {
      provide: DEV_TOOLS_BUFFER,
      useFactory: () => {
        const b = new DevToolsRingBuffer();
        b.setCapacity(bufferSize);
        const bus = inject(DEV_TOOLS_EVENT_BUS);
        bus.events$.subscribe((ev) => b.push(ev));
        return b;
      },
    },
    ...provideFnWrapperCollector({ trackKinds: options.trackKinds }),
  ];

  if (autoMount) {
    providers.push({
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => {
        const appRef = inject(ApplicationRef);
        const envInjector = inject(EnvironmentInjector);
        return () => {
          if (typeof document === 'undefined') return;
          // Defer to next macrotask so app bootstrap completes first.
          setTimeout(() => mountPanel(appRef, envInjector), 0);
        };
      },
    });
  }

  return providers;
}

function mountPanel(
  appRef: ApplicationRef,
  envInjector: EnvironmentInjector,
): void {
  if (document.getElementById('craft-devtools-root')) return;
  const host = document.createElement('div');
  host.id = 'craft-devtools-root';
  document.body.appendChild(host);
  const compRef = createComponent(CraftDevToolsPanelComponent, {
    hostElement: host,
    environmentInjector: envInjector,
  });
  appRef.attachView(compRef.hostView);
}
