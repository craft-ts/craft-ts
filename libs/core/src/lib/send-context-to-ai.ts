import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  ElementRef,
  inject,
  Injectable,
  Injector,
  runInInjectionContext,
  type Provider,
} from '@angular/core';
import { debounceTime, Subject } from 'rxjs';
import { AiContextMenuComponent } from './ai-context-menu.component';
import { AiSendDialogComponent } from './ai-send-dialog.component';
import { provideComponentMonitoring } from './component-monitoring';
import { fromEventToSource$ } from './from-event-to-source$';
import { HOST_TAG_LIST, injectHostName } from './host-tag';
import { type SendContextPayload } from './send-context-to-ai.tokens';
import {
  APP_SNAPSHOT_REGISTRY,
  TAKE_APP_SNAPSHOT,
  type SnapshotReport,
} from './take-app-snapshot';

export { type SendContextPayload };

const HANDLED_FLAG = Symbol('craft-ai-contextmenu-handled');
type HandledEvent = MouseEvent & { [HANDLED_FLAG]?: true };

@Injectable({ providedIn: 'root' })
export class SendContextToAiBuffer {
  latestReports: SnapshotReport[] = [];
  private pending: SnapshotReport[] = [];
  private readonly flush$ = new Subject<void>();

  constructor() {
    const registry = inject(APP_SNAPSHOT_REGISTRY);
    registry.allSnapShot$.subscribe((report) => {
      this.pending.push(report);
      this.flush$.next();
    });
    this.flush$.pipe(debounceTime(500)).subscribe(() => {
      this.latestReports = [...this.pending];
      this.pending = [];
    });
  }
}

@Injectable({ providedIn: 'root' })
export class AiContextMenuController {
  private readonly appRef = inject(ApplicationRef);
  private readonly buffer = inject(SendContextToAiBuffer);
  private readonly takeSnapshot = inject(TAKE_APP_SNAPSHOT);

  private menuRef: ComponentRef<AiContextMenuComponent> | null = null;
  private dialogRef: ComponentRef<AiSendDialogComponent> | null = null;

  open(ctx: Omit<SendContextPayload, 'snapshot'>): void {
    this.closeMenu();
    this.closeDialog();
    // Trigger a snapshot collection now so the buffer is populated
    // by the time the user submits the dialog.
    this.takeSnapshot();

    const menuRef = createComponent(AiContextMenuComponent, {
      environmentInjector: this.appRef.injector,
    });
    menuRef.setInput('x', ctx.coords.x);
    menuRef.setInput('y', ctx.coords.y);
    menuRef.instance.select.subscribe(() => this.onSelect(ctx));
    menuRef.instance.dismiss.subscribe(() => this.closeMenu());
    this.appRef.attachView(menuRef.hostView);
    document.body.appendChild(menuRef.location.nativeElement);
    this.menuRef = menuRef;
  }

  private onSelect(ctx: Omit<SendContextPayload, 'snapshot'>) {
    this.closeMenu();
    // Wait for the snapshot buffer's debounceTime(500ms) to settle.
    setTimeout(() => {
      this.openDialog({
        ...ctx,
        snapshot: this.buffer.latestReports,
      });
    }, 550);
  }

  private openDialog(payload: SendContextPayload) {
    const ref = createComponent(AiSendDialogComponent, {
      environmentInjector: this.appRef.injector,
    });
    ref.setInput('payload', payload);
    ref.instance.close.subscribe(() => this.closeDialog());
    this.appRef.attachView(ref.hostView);
    document.body.appendChild(ref.location.nativeElement);
    this.dialogRef = ref;
  }

  private closeMenu() {
    if (this.menuRef) {
      this.appRef.detachView(this.menuRef.hostView);
      this.menuRef.destroy();
      this.menuRef = null;
    }
  }

  private closeDialog() {
    if (this.dialogRef) {
      this.appRef.detachView(this.dialogRef.hostView);
      this.dialogRef.destroy();
      this.dialogRef = null;
    }
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
