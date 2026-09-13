import {
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  runInInjectionContext,
  type Provider,
  type ProviderToken,
} from '../host-runtime';
import {
  APP_SNAPSHOT_REGISTRY,
  craftSignal,
  craftToken,
  createSendContextToAiBuffer,
  CRAFT_TEMPORAL_RUNTIME,
  HostTag,
  HOST_TAG_LIST,
  injectHostName,
  provideComponentMonitoring,
  provideFnWrapper,
  SEND_CONTEXT_TO_AI_BUFFER,
  SendContextToAiBuffer,
  SEND_CONTEXT_SESSION,
  provideSendContextSession,
  type SendContextTarget,
  TAKE_APP_SNAPSHOT,
  type CraftToken,
  type GetDeps,
  type SendContextPayload,
  type SendContextSession,
  type SendContextSessionSnapshot,
  type TemporalTaskHandle,
} from '@craft-ts/core';
import { mountCraftComponent } from '../bridge';
import type { Output } from '../types';
import { AiContextMenu } from './ai-context-menu';
import { AiSendDialog } from './ai-send-dialog';
import { AiSendContextChat } from './ai-send-context-chat';
import { AiSendContextLauncher } from './ai-send-context-launcher';
import {
  SEND_CONTEXT_CHAT_COMPONENT,
  SEND_CONTEXT_CHAT_ACTION,
  SEND_CONTEXT_CHAT_SECTION,
  SEND_CONTEXT_CONTEXT_MENU_COMPONENT,
  SEND_CONTEXT_EXPORT_SECTION,
  SEND_CONTEXT_LAUNCHER_COMPONENT,
  SEND_CONTEXT_UI_RENDERER,
  type SendContextChatComponent,
  type SendContextContextMenuComponent,
  type SendContextLauncherComponent,
  type SendContextUiContext,
  type SendContextUiRenderer,
  type SendContextChatSection,
  type SendContextChatAction,
  type SendContextExportSection,
  provideSendContextChatComponent,
} from './send-context-ui.tokens';

const HANDLED_FLAG = Symbol('craft-ai-contextmenu-handled');
type HandledEvent = MouseEvent & { [HANDLED_FLAG]?: true };

const aiContextMenuCleanups = new WeakMap<HTMLElement, () => void>();

function componentHostNameFromTags(tags: readonly string[]): string {
  const componentTag = [...tags]
    .reverse()
    .find((tag) => tag.startsWith('component:'));
  if (!componentTag) return 'application';

  const name = componentTag.slice('component:'.length);
  const idSeparator = name.lastIndexOf('#');
  return idSeparator === -1 ? name : name.slice(0, idSeparator);
}

function installAiContextMenuListener({
  element,
  hostName,
  tagList,
  injector,
  controller,
  destroyRef,
}: {
  element: HTMLElement;
  hostName: string;
  tagList: readonly string[];
  injector: Injector;
  controller: AiContextMenuController;
  destroyRef: DestroyRef;
}): void {
  if (element.closest('[data-craft-ai-overlay]')) return;
  if (aiContextMenuCleanups.has(element)) return;

  const onContextMenu = (event: MouseEvent): void => {
    const handled = event as HandledEvent;
    if (handled[HANDLED_FLAG]) return;
    handled[HANDLED_FLAG] = true;

    event.preventDefault();
    event.stopPropagation();

    const clickedElement =
      event.target instanceof Element ? event.target : element;

    runInInjectionContext(injector, () => {
      controller.open({
        hostName,
        tagList,
        coords: { x: event.clientX, y: event.clientY },
        clickedElement: {
          tagName: clickedElement.tagName.toLowerCase(),
          textContent: (clickedElement.textContent ?? '').trim().slice(0, 500),
          outerHTML: (clickedElement.outerHTML ?? '').slice(0, 2000),
        },
        captureElement: element,
        outerHTML: (element.outerHTML ?? '').slice(0, 2000),
      });
    });
  };

  element.addEventListener('contextmenu', onContextMenu);
  const cleanup = () => {
    element.removeEventListener('contextmenu', onContextMenu);
    aiContextMenuCleanups.delete(element);
  };
  aiContextMenuCleanups.set(element, cleanup);
  destroyRef.onDestroy(cleanup);
}

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
  host.dataset['craftAiOverlay'] = 'true';
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

/** What a right-click captures, before the app snapshot is attached. */
export type CapturedContext = Omit<SendContextPayload, 'snapshot'> & {
  readonly captureElement?: Element;
};

export type AiContextMenuController = {
  open(ctx: CapturedContext): void;
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
  session,
  renderer,
  chatComponent,
  contextMenuComponent,
  launcherComponent,
  chatSections,
  chatActions,
  exportSections,
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
  session?: SendContextSession;
  renderer?: SendContextUiRenderer;
  chatComponent?: SendContextChatComponent;
  contextMenuComponent?: SendContextContextMenuComponent;
  launcherComponent?: SendContextLauncherComponent;
  chatSections?: readonly SendContextChatSection[];
  chatActions?: readonly SendContextChatAction[];
  exportSections?: readonly SendContextExportSection[];
}): AiContextMenuController {
  let menu: Overlay | null = null;
  let dialog: Overlay | null = null;
  let launcher: Overlay | null = null;
  let dialogTimer: TemporalTaskHandle | null = null;

  // The captured context and the element list are the two things a renderer
  // reads and the controller writes, so they live in signals: a template that
  // touches them through the UI context re-renders on the next capture.
  const capturedSignal = craftSignal<CapturedContext | null>(null);
  const targetsSignal = craftSignal<readonly SendContextTarget[]>([]);
  const snapshotSignal = craftSignal<SendContextSessionSnapshot>({
    events: session?.events ?? [],
    clips: session?.clips ?? [],
    ...(session?.activeClip ? { activeClipId: session.activeClip.id } : {}),
  });
  if (session) {
    const subscription = session.snapshot$.subscribe((value) =>
      snapshotSignal.set(value),
    );
    destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  function sameTarget(a: SendContextTarget, b: SendContextTarget): boolean {
    return a.tagName === b.tagName && a.outerHTML === b.outerHTML;
  }

  function addTarget(target: SendContextTarget): void {
    const current = targetsSignal();
    if (current.some((entry) => sameTarget(entry, target))) return;
    targetsSignal.set([...current, target]);
  }

  function closeMenu(): void {
    menu = closeOverlay(menu);
  }

  function closeDialog(): void {
    dialog = closeOverlay(dialog);
    // The chat sits in the same corner as the launcher, so the launcher is
    // unmounted while it is open and comes back with it.
    mountLauncher();
  }

  function closeLauncher(): void {
    launcher = closeOverlay(launcher);
  }

  function mountLauncher(): void {
    if (launcher || typeof document === 'undefined') return;
    const component = launcherComponent ?? AiSendContextLauncher;
    launcher = openOverlay(99997, 'none', (host) =>
      mountCraftComponent(component, host, injector, {
        onOpen: () => onSelect(capturedSignal()),
      } as never),
    );
  }

  const uiContext: SendContextUiContext = {
    get session() {
      // Only reachable from the session-backed renderers below, which are
      // mounted after this has been checked.
      return session as SendContextSession;
    },
    get events() {
      return snapshotSignal().events;
    },
    get clips() {
      return snapshotSignal().clips;
    },
    get targets() {
      return targetsSignal();
    },
    get recording() {
      return snapshotSignal().activeClipId !== undefined;
    },
    get payload() {
      const captured = capturedSignal();
      if (!captured) return undefined;
      const { captureElement: _captureElement, ...rest } = captured;
      // Read lazily: the snapshot buffer debounces, so the reports are richer
      // at copy time than they were when the chat opened.
      return { ...rest, snapshot: buffer.latestReports };
    },
    get captureElement() {
      return capturedSignal()?.captureElement;
    },
    chatSections: chatSections ?? [],
    chatActions: chatActions ?? [],
    exportSections: exportSections ?? [],
    get selectedClipId() {
      return snapshotSignal().activeClipId;
    },
    addTarget,
    removeTarget(target) {
      targetsSignal.set(
        targetsSignal().filter(
          (entry) => entry !== target && !sameTarget(entry, target),
        ),
      );
    },
    selectClip(id) {
      session?.selectClip(id);
    },
    close: () => closeDialog(),
  };

  function openLegacyDialog(
    payload: SendContextPayload & { readonly captureElement?: Element },
  ): void {
    dialog = openOverlay(99999, 'auto', (host) =>
      mountCraftComponent(AiSendDialog, host, injector, {
        payload: function* () {
          return payload;
        },
        onClose: closeDialog as unknown as Output<() => void>,
      }),
    );
  }

  function openSessionDialog(): void {
    const component = renderer ?? chatComponent;
    if (!component) return;
    closeLauncher();
    dialog = openOverlay(99999, 'none', (host) =>
      mountCraftComponent(component, host, injector, {
        context: function* () {
          return uiContext;
        },
        onClose: closeDialog as unknown as Output<() => void>,
      } as never),
    );
  }

  function onSelect(ctx: CapturedContext | null): void {
    closeMenu();
    if (ctx) {
      capturedSignal.set(ctx);
      if (ctx.clickedElement) {
        addTarget({
          tagName: ctx.clickedElement.tagName,
          textContent: ctx.clickedElement.textContent,
          outerHTML: ctx.clickedElement.outerHTML,
        });
      }
      for (const target of ctx.targets ?? []) addTarget(target);
    }

    if (session) {
      // The chat reads everything through signals, so an already-open chat
      // just picks the new element up — remounting it would throw away the
      // instruction the user is in the middle of typing.
      if (dialog) return;
      // It also reads `buffer.latestReports` when the user copies, so there is
      // nothing to wait for: open now and let the buffer fill behind it.
      takeSnapshot();
      openSessionDialog();
      return;
    }

    if (!ctx) return;
    closeDialog();
    // Wait for the snapshot buffer's debounceTime(500ms) to settle: the legacy
    // dialog freezes the reports it is opened with.
    dialogTimer = temporalRuntime.schedule(
      () => {
        dialogTimer = null;
        openLegacyDialog({ ...ctx, snapshot: buffer.latestReports });
      },
      550,
      {
        kind: 'ai-context-debounce',
        owner: 'ai-context-menu',
        destroyRef,
      },
    );
  }

  mountLauncher();
  destroyRef.onDestroy(() => {
    dialogTimer?.cancel();
    closeMenu();
    dialog = closeOverlay(dialog);
    closeLauncher();
  });

  return {
    open(ctx: CapturedContext): void {
      capturedSignal.set(ctx);
      dialogTimer?.cancel();
      dialogTimer = null;
      closeMenu();
      // The session chat survives a right-click and absorbs the new element;
      // the legacy dialog freezes its payload, so it has to be rebuilt.
      if (!session) {
        dialog = closeOverlay(dialog);
        mountLauncher();
      }
      // Trigger a snapshot collection now so the buffer is populated
      // by the time the user submits the dialog.
      takeSnapshot();

      menu = openOverlay(99998, 'none', (host) =>
        mountCraftComponent(
          contextMenuComponent ?? AiContextMenu,
          host,
          injector,
          {
            x: function* () {
              return ctx.coords.x;
            },
            y: function* () {
              return ctx.coords.y;
            },
            onSelect: () => onSelect(ctx),
            onDismiss: closeMenu,
          },
        ),
      );
    },
  };
}

function asAngularToken<T>(token: CraftToken<T>): ProviderToken<T> {
  return token as unknown as ProviderToken<T>;
}

export function provideSendContextToAi(): Provider[] {
  return [
    ...provideSendContextSession(),
    provideSendContextChatComponent(() => AiSendContextChat),
    {
      provide: SEND_CONTEXT_CONTEXT_MENU_COMPONENT,
      useValue: AiContextMenu,
    },
    {
      provide: SEND_CONTEXT_LAUNCHER_COMPONENT,
      useValue: AiSendContextLauncher,
    },
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
          session: inject(SEND_CONTEXT_SESSION),
          renderer:
            inject(SEND_CONTEXT_UI_RENDERER, { optional: true }) ?? undefined,
          chatComponent: inject(SEND_CONTEXT_CHAT_COMPONENT),
          contextMenuComponent: inject(SEND_CONTEXT_CONTEXT_MENU_COMPONENT),
          launcherComponent: inject(SEND_CONTEXT_LAUNCHER_COMPONENT),
          chatSections:
            inject(SEND_CONTEXT_CHAT_SECTION, { optional: true }) ?? [],
          chatActions:
            inject(SEND_CONTEXT_CHAT_ACTION, { optional: true }) ?? [],
          exportSections:
            inject(SEND_CONTEXT_EXPORT_SECTION, { optional: true }) ?? [],
        }),
    },
    provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (factory, thisArg, args) {
        const hostTags = yield* HostTag();
        if (!hostTags.some((tag) => tag.startsWith('component:'))) {
          return yield* factory.apply(thisArg, args);
        }

        const elementRef = inject(ElementRef);
        const element = elementRef.nativeElement as HTMLElement;
        // Overlay components are mounted while the controller may still be
        // resolving. Inspecting the controller for its own launcher/menu
        // would re-enter this provider factory and break application startup.
        if (element.closest('[data-craft-ai-overlay]')) {
          return yield* factory.apply(thisArg, args);
        }
        installAiContextMenuListener({
          element,
          hostName: componentHostNameFromTags(hostTags),
          tagList: hostTags,
          injector: inject(Injector),
          controller: inject(asAngularToken(AI_CONTEXT_MENU_CONTROLLER)),
          destroyRef: inject(DestroyRef),
        });

        return yield* factory.apply(thisArg, args);
      },
    ),
    provideComponentMonitoring(() => {
      const el = inject(ElementRef).nativeElement as HTMLElement;
      const tagList = inject(HOST_TAG_LIST);
      const injector = inject(Injector);
      const controller = inject(asAngularToken(AI_CONTEXT_MENU_CONTROLLER));
      const destroyRef = inject(DestroyRef);
      // Eagerly instantiate the buffer so snapshot reports start being collected.
      inject(asAngularToken(SEND_CONTEXT_TO_AI_BUFFER));

      installAiContextMenuListener({
        element: el,
        hostName: injectHostName(),
        tagList,
        injector,
        controller,
        destroyRef,
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
