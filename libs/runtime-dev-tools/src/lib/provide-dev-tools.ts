import {
  APP_INITIALIZER,
  createComponent,
  inject,
  type Provider,
} from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import {
  APP_SNAPSHOT_REGISTRY,
  INSERTION_SNAPSHOT_REGISTRY,
} from '@craft-ng/core';
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

/**
 * Provides the craft-ng DevTools panel.
 *
 * Architecture note: the panel is mounted into its OWN `ApplicationRef` via
 * `createApplication()` rather than into the user app's view tree. This is
 * critical because writing to the buffer's signal would otherwise mark the
 * user app's root view dirty, scheduling a CD pass that re-executes templates,
 * which can re-call methods like `{{ selectValue() }}` — those methods route
 * through the FnWrapper and emit more events → CD again → infinite loop at
 * the throttle rate.
 *
 * With a separate ApplicationRef, the panel's signal updates only mark the
 * devtools' own view tree dirty. The user app's CD scheduler is never notified
 * by devtools signal writes, breaking the feedback loop entirely.
 *
 * Shared singletons (event bus, ring buffer, snapshot registries) are passed
 * to the devtools app via `useValue` so both the user app's collectors and
 * the devtools panel see the same instances.
 */
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
        const bus = inject(DEV_TOOLS_EVENT_BUS);
        const buffer = inject(DEV_TOOLS_BUFFER);
        const snapshotRegistry = inject(APP_SNAPSHOT_REGISTRY);
        const insertionRegistry = inject(INSERTION_SNAPSHOT_REGISTRY, {
          optional: true,
        });
        return () => {
          if (typeof document === 'undefined') return;
          // Defer mount so the user app finishes bootstrap first.
          setTimeout(() => {
            mountIsolatedDevToolsApp(
              bus,
              buffer,
              snapshotRegistry,
              insertionRegistry,
            ).catch((err) => console.error('[craft-devtools]', err));
          }, 0);
        };
      },
    });
  }

  return providers;
}

async function mountIsolatedDevToolsApp(
  bus: DevToolsEventBus,
  buffer: DevToolsRingBuffer,
  snapshotRegistry: unknown,
  insertionRegistry: unknown,
): Promise<void> {
  if (document.getElementById('craft-devtools-root')) return;
  const host = document.createElement('div');
  host.id = 'craft-devtools-root';
  document.body.appendChild(host);

  const isolatedProviders: Provider[] = [
    { provide: DEV_TOOLS_EVENT_BUS, useValue: bus },
    { provide: DEV_TOOLS_BUFFER, useValue: buffer },
    { provide: APP_SNAPSHOT_REGISTRY, useValue: snapshotRegistry },
  ];
  if (insertionRegistry) {
    isolatedProviders.push({
      provide: INSERTION_SNAPSHOT_REGISTRY,
      useValue: insertionRegistry,
    });
  }

  const appRef = await createApplication({ providers: isolatedProviders });

  const compRef = createComponent(CraftDevToolsPanelComponent, {
    hostElement: host,
    environmentInjector: appRef.injector,
  });
  appRef.attachView(compRef.hostView);
}
