import {
  ɵAngularDestroyRef as DestroyRef,
  ɵAngularElementRef as ElementRef,
  ɵangularInject as inject,
  ɵAngularInjector as Injector,
  ɵrunInAngularInjectionContext as runInInjectionContext,
  type ɵAngularProvider as Provider,
  type ɵAngularProviderToken as ProviderToken,
} from '@craft-ng/angular';
import {
  APP_SNAPSHOT_REGISTRY,
  craftToken,
  createSendContextToAiBuffer,
  fromEventToSource$,
  HOST_TAG_LIST,
  CRAFT_TEMPORAL_RUNTIME,
  injectHostName,
  provideComponentMonitoring,
  SEND_CONTEXT_TO_AI_BUFFER,
  SendContextToAiBuffer,
  TAKE_APP_SNAPSHOT,
  type CraftToken,
  type GetDeps,
  type SendContextPayload,
  type TemporalTaskHandle,
} from '@craft-ng/core';
import { mountCraftComponent } from '../bridge';
import { AiContextMenu } from './ai-context-menu';
import { AiSendDialog } from './ai-send-dialog';

const HANDLED_FLAG = Symbol('craft-ai-contextmenu-handled');
type HandledEvent = MouseEvent & { [HANDLED_FLAG]?: true };

type Overlay = {
  readonly host: HTMLElement;
  readonly mount: { destroy(): void };
};

/**
 * Creates the full-screen host element the craft overlay is mounted into.
 * These are the styles the components used to carry on their `:host`.
 */
function openOverlay(
  zIndex: number,
  pointerEvents: 'none' | 'auto',
  mount: (host: HTMLElement) => { destroy(): void },
): Overlay {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = String(zIndex);
  host.style.pointerEvents = pointerEvents;
  document.body.appendChild(host);
  return { host, mount: mount(host) };
}

function closeOverlay(overlay: Overlay | null): null {
  if (overlay) {
    overlay.mount.destroy();
    overlay.host.remove();
  }
  return null;
}

export type AiContextMenuController = {
  open(ctx: Omit<SendContextPayload, 'snapshot'>): void;
};

export const AI_CONTEXT_MENU_CONTROLLER = craftToken<AiContextMenuController>(
  'AiContextMenuController',
);

export function createAiContextMenuController({
  injector,
  buffer,
  takeSnapshot,
  temporalRuntime,
  destroyRef,
}: {
  injector: Injector;
  buffer: SendContextToAiBuffer;
  takeSnapshot: () => void;
  temporalRuntime: {
    schedule(
      callback: () => void,
      delay: number,
      options: {
        kind: string;
        owner: string;
        destroyRef: DestroyRef;
      },
    ): TemporalTaskHandle;
  };
  destroyRef: DestroyRef;
}): AiContextMenuController {
  let menu: Overlay | null = null;
  let dialog: Overlay | null = null;
  let dialogTimer: TemporalTaskHandle | null = null;

  function closeMenu(): void {
    menu = closeOverlay(menu);
  }

  function closeDialog(): void {
    dialog = closeOverlay(dialog);
  }

  function openDialog(payload: SendContextPayload): void {
    dialog = openOverlay(99999, 'auto', (host) =>
      mountCraftComponent(AiSendDialog, host, injector, {
        payload: function* () {
          return payload;
        },
        onClose: closeDialog,
      }),
    );
  }

  function onSelect(ctx: Omit<SendContextPayload, 'snapshot'>): void {
    closeMenu();
    // Wait for the snapshot buffer's debounceTime(500ms) to settle.
    dialogTimer = temporalRuntime.schedule(
      () => {
        dialogTimer = null;
        openDialog({ ...ctx, snapshot: buffer.latestReports });
      },
      550,
      {
        kind: 'ai-context-debounce',
        owner: 'ai-context-menu',
        destroyRef,
      },
    );
  }

  return {
    open(ctx: Omit<SendContextPayload, 'snapshot'>): void {
      dialogTimer?.cancel();
      dialogTimer = null;
      closeMenu();
      closeDialog();
      // Trigger a snapshot collection now so the buffer is populated
      // by the time the user submits the dialog.
      takeSnapshot();

      menu = openOverlay(99998, 'none', (host) =>
        mountCraftComponent(AiContextMenu, host, injector, {
          x: function* () {
            return ctx.coords.x;
          },
          y: function* () {
            return ctx.coords.y;
          },
          onSelect: () => onSelect(ctx),
          onDismiss: closeMenu,
        }),
      );
    },
  };
}

function asAngularToken<T>(token: CraftToken<T>): ProviderToken<T> {
  return token as unknown as ProviderToken<T>;
}

export function provideSendContextToAi(): Provider[] {
  return [
    {
      provide: asAngularToken(SEND_CONTEXT_TO_AI_BUFFER),
      useFactory: () =>
        createSendContextToAiBuffer(inject(APP_SNAPSHOT_REGISTRY)),
    },
    {
      provide: asAngularToken(AI_CONTEXT_MENU_CONTROLLER),
      useFactory: () =>
        createAiContextMenuController({
          injector: inject(Injector),
          buffer: inject(asAngularToken(SEND_CONTEXT_TO_AI_BUFFER)),
          takeSnapshot: inject(TAKE_APP_SNAPSHOT),
          temporalRuntime: inject(CRAFT_TEMPORAL_RUNTIME),
          destroyRef: inject(DestroyRef),
        }),
    },
    provideComponentMonitoring(() => {
      const el = inject(ElementRef).nativeElement as HTMLElement;
      const tagList = inject(HOST_TAG_LIST, { optional: true }) as unknown;
      const injector = inject(Injector);
      const controller = inject(asAngularToken(AI_CONTEXT_MENU_CONTROLLER));
      // Eagerly instantiate the buffer so snapshot reports start being collected.
      inject(asAngularToken(SEND_CONTEXT_TO_AI_BUFFER));

      fromEventToSource$<MouseEvent>(el, 'contextmenu').subscribe((event) => {
        const handled = event as HandledEvent;
        if (handled[HANDLED_FLAG]) return;
        handled[HANDLED_FLAG] = true;

        event.preventDefault();
        event.stopPropagation();

        runInInjectionContext(injector, () => {
          const hostName = injectHostName();
          const outerHTML = (el.outerHTML ?? '').slice(0, 2000);
          controller.open({
            hostName,
            tagList,
            coords: { x: event.clientX, y: event.clientY },
            outerHTML,
          });
        });
      });
    }),
  ];
}

export type GenDeps_AiContextMenuController = GetDeps<{
  deps: {};
  provided: {};
  missingProvider: {
    Injector: Injector;
    TAKE_APP_SNAPSHOT: typeof TAKE_APP_SNAPSHOT;
  };
}>;
