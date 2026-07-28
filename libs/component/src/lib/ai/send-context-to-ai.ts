import {
  ElementRef,
  inject,
  Injectable,
  Injector,
  runInInjectionContext,
  type Provider,
} from '@angular/core';
import {
  fromEventToSource$,
  HOST_TAG_LIST,
  injectHostName,
  provideComponentMonitoring,
  SendContextToAiBuffer,
  TAKE_APP_SNAPSHOT,
  type SendContextPayload,
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

@Injectable({ providedIn: 'root' })
export class AiContextMenuController {
  private readonly injector = inject(Injector);
  private readonly buffer = inject(SendContextToAiBuffer);
  private readonly takeSnapshot = inject(TAKE_APP_SNAPSHOT);

  private menu: Overlay | null = null;
  private dialog: Overlay | null = null;

  open(ctx: Omit<SendContextPayload, 'snapshot'>): void {
    this.closeMenu();
    this.closeDialog();
    // Trigger a snapshot collection now so the buffer is populated
    // by the time the user submits the dialog.
    this.takeSnapshot();

    this.menu = openOverlay(99998, 'none', (host) =>
      mountCraftComponent(AiContextMenu, host, this.injector, {
        x: () => ctx.coords.x,
        y: () => ctx.coords.y,
        onSelect: () => this.onSelect(ctx),
        onDismiss: () => this.closeMenu(),
      }),
    );
  }

  private onSelect(ctx: Omit<SendContextPayload, 'snapshot'>) {
    this.closeMenu();
    // Wait for the snapshot buffer's debounceTime(500ms) to settle.
    setTimeout(() => {
      this.openDialog({ ...ctx, snapshot: this.buffer.latestReports });
    }, 550);
  }

  private openDialog(payload: SendContextPayload) {
    this.dialog = openOverlay(99999, 'auto', (host) =>
      mountCraftComponent(AiSendDialog, host, this.injector, {
        payload: () => payload,
        onClose: () => this.closeDialog(),
      }),
    );
  }

  private closeMenu() {
    this.menu = closeOverlay(this.menu);
  }

  private closeDialog() {
    this.dialog = closeOverlay(this.dialog);
  }
}

export function provideSendContextToAi(): Provider[] {
  return [
    provideComponentMonitoring(() => {
      const el = inject(ElementRef).nativeElement as HTMLElement;
      const tagList = inject(HOST_TAG_LIST, { optional: true }) as unknown;
      const injector = inject(Injector);
      const controller = inject(AiContextMenuController);
      // Eagerly instantiate the buffer so snapshot reports start being collected.
      inject(SendContextToAiBuffer);

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
