import {
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  runInInjectionContext,
  type Provider,
} from '../host-runtime';
import {
  craftSignal,
  createSendContextToAiBuffer,
  type SendContextToAiBuffer,
  HostTag,
  HOST_TAG_LIST,
  injectHostName,
  provideComponentMonitoring,
  provideFnWrapper,
  provideSendContextToAiBuffer,
  provideAppInitializer,
  provideSendContextEventFilter,
  provideSendContextEventEnricher,
  provideSendContextEventSource,
  provideSendContextSession,
  getCurrentStartCorrelationId,
  ɵcaptureCraftReplayTarget,
  ɵinjectAppSnapshotRegistry,
  ɵinjectCraftPrimitiveRegistry,
  ɵinjectSendContextSession,
  ɵinjectTakeAppSnapshot,
  ɵinjectSendContextToAiBuffer,
  ɵinjectPersistedStorageSnapshotRegistry,
  ɵinjectCraftRouterRuntime,
  type SendContextTarget,
  type GetDeps,
  type SendContextPayload,
  type SendContextSession,
  type SendContextSessionSnapshot,
  ɵcraftValueService,
} from '@craft-ts/core';
import { mountCraftComponent } from '../bridge';
import type { Output } from '../types';
import { AiContextMenu } from './ai-context-menu';
import { observeAiPerformance } from './ai-performance';
import { AiSendDialog } from './ai-send-dialog';
import { AiSendContextChat } from './ai-send-context-chat';
import {
  AiSendContextLauncher,
  type AiLauncherPosition,
} from './ai-send-context-launcher';
import { craftAiLauncherPosition } from './ai-overlay.style';
import { assign, unit } from '@craft-ts/style';
import { connectDebugSessionPersistence } from './debug-session-persistence';
import {
  captureBrowserStorageSnapshot,
  type BrowserStorageSnapshot,
  connectBrowserStorageCheckpoints,
  INITIAL_BROWSER_STORAGE_EVENT,
} from './debug-session-browser-storage';
import { connectDebugSessionDialogCapture } from './debug-session-dialogs';
import { connectDebugSessionFetchCapture } from './debug-session-fetch-capture';
import { connectDebugSessionFormCapture } from './debug-session-form-capture';
import { connectDebugSessionHoverCapture } from './debug-session-hover';
import { connectDebugSessionPerformanceCapture } from './debug-session-performance';
import { connectDebugSessionScrollCapture } from './debug-session-scroll';
import { connectDebugSessionViewportCapture } from './debug-session-viewport';
import { connectReplaySnapshotCapture } from './debug-session-orchestrator';
import {
  CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
  isCraftDebugReplayLaunch,
} from './debug-session-replay-signals';
import {
  provideSendContextChatActionsDefault,
  provideSendContextChatSectionsDefault,
  provideSendContextContextMenuComponent,
  provideSendContextExportSectionsDefault,
  provideSendContextLauncherComponent,
  type SendContextChatComponent,
  type SendContextContextMenuComponent,
  type SendContextLauncherComponent,
  type SendContextUiContext,
  type SendContextUiRenderer,
  type SendContextChatSection,
  type SendContextChatAction,
  type SendContextExportSection,
  provideSendContextChatComponent,
  ɵinjectSendContextChatActions,
  ɵinjectSendContextChatComponent,
  ɵinjectSendContextChatSections,
  ɵinjectSendContextContextMenuComponent,
  ɵinjectSendContextExportSections,
  ɵinjectSendContextLauncherComponent,
  ɵinjectSendContextUiRenderer,
} from './send-context-ui.tokens';

import {
  applySendContextTheme,
  type SendContextTheme,
} from './send-context-theme';

const HANDLED_FLAG = Symbol('craft-ai-contextmenu-handled');
type HandledEvent = MouseEvent & { [HANDLED_FLAG]?: true };

const aiComponentContexts = new WeakMap<
  Element,
  { hostName: string; tagList: readonly string[] }
>();

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
  aiComponentContexts.set(element, { hostName, tagList });

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
    aiComponentContexts.delete(element);
  };
  aiContextMenuCleanups.set(element, cleanup);
  destroyRef.onDestroy(cleanup);
}

type Overlay = {
  readonly host: HTMLElement;
  readonly mount: { destroy(): void };
  readonly cleanup: () => void;
};

/**
 * Creates the full-screen host element the craft overlay is mounted into.
 * These are the styles the components used to carry on their `:host`.
 */
function openOverlay(
  zIndex: number,
  pointerEvents: 'none' | 'auto',
  mount: (host: HTMLElement) => { destroy(): void },
  theme?: SendContextTheme,
): Overlay {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = String(zIndex);
  host.style.pointerEvents = pointerEvents;
  host.dataset['craftAiOverlay'] = 'true';
  document.body.appendChild(host);
  const mounted = mount(host);
  return { host, mount: mounted, cleanup: applySendContextTheme(host, theme) };
}

function closeOverlay(overlay: Overlay | null): null {
  if (overlay) {
    overlay.cleanup();
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

const aiContextMenuControllerService = ɵcraftValueService(
  { name: 'AiContextMenuController', providedIn: 'toProvide' },
  (inputs: {
    $provided: AiContextMenuController | (() => AiContextMenuController);
  }) =>
    typeof inputs.$provided === 'function'
      ? inputs.$provided()
      : inputs.$provided,
) as unknown as {
  AiContextMenuController: () => Generator<
    unknown,
    AiContextMenuController,
    unknown
  >;
  provideAiContextMenuController: (
    value: AiContextMenuController | (() => AiContextMenuController),
  ) => Provider;
  AI_CONTEXT_MENU_CONTROLLER_META_DATA: {
    inject(): AiContextMenuController;
  };
};

export const AiContextMenuController =
  aiContextMenuControllerService.AiContextMenuController;
export const provideAiContextMenuController = (
  value: AiContextMenuController | (() => AiContextMenuController),
): Provider =>
  aiContextMenuControllerService.provideAiContextMenuController(value);
export const ɵinjectAiContextMenuController =
  (): AiContextMenuController | null => {
    try {
      return aiContextMenuControllerService.AI_CONTEXT_MENU_CONTROLLER_META_DATA.inject();
    } catch {
      return null;
    }
  };

export function createAiContextMenuController({
  injector,
  buffer,
  takeSnapshot,
  destroyRef,
  session,
  renderer,
  chatComponent,
  contextMenuComponent,
  launcherComponent,
  chatSections,
  chatActions,
  exportSections,
  endpoint,
  theme,
}: {
  injector: Injector;
  buffer: SendContextToAiBuffer;
  takeSnapshot: () => void;
  destroyRef: DestroyRef;
  session?: SendContextSession;
  renderer?: SendContextUiRenderer;
  chatComponent?: SendContextChatComponent;
  contextMenuComponent?: SendContextContextMenuComponent;
  launcherComponent?: SendContextLauncherComponent;
  chatSections?: readonly SendContextChatSection[];
  chatActions?: readonly SendContextChatAction[];
  exportSections?: readonly SendContextExportSection[];
  endpoint?: string;
  theme?: SendContextTheme;
}): AiContextMenuController {
  let menu: Overlay | null = null;
  let dialog: Overlay | null = null;
  let launcher: Overlay | null = null;
  let launcherPosition: AiLauncherPosition | undefined;
  // Long tasks are recorded from startup so a freeze that happens before the
  // chat is opened still shows up in the next exported prompt.
  const stopAiPerformance = observeAiPerformance();

  // The captured context and the element list are the two things a renderer
  // reads and the controller writes, so they live in signals: a template that
  // touches them through the UI context re-renders on the next capture.
  const capturedSignal = craftSignal<CapturedContext | null>(null);
  const selectingTarget = craftSignal(false);
  const targetsSignal = craftSignal<readonly SendContextTarget[]>([]);
  const snapshotSignal = craftSignal<SendContextSessionSnapshot>({
    events: session?.events ?? [],
    clips: session?.clips ?? [],
    ...(session?.activeClip ? { activeClipId: session.activeClip.id } : {}),
  });
  if (session) {
    const subscription = session.snapshot$.subscribe({
      next: (value) => snapshotSignal.set(value),
    });
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
    cancelTargetSelection();
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
    launcher = openOverlay(
      99997,
      'none',
      (host) => {
        const mounted = mountCraftComponent(component, host, injector, {
          onOpen: () => onSelect(capturedSignal()),
          onMove: (position: AiLauncherPosition | undefined) => {
            launcherPosition = position;
            // Reset inherited overrides as well as the launcher's local ones.
            if (!position) {
              host.style.removeProperty(
                craftAiLauncherPosition.right.declaration.name,
              );
              host.style.removeProperty(
                craftAiLauncherPosition.bottom.declaration.name,
              );
            }
          },
        } as never);
        if (launcherPosition) {
          const styles = {
            ...assign(
              craftAiLauncherPosition.right,
              unit.px(launcherPosition.right),
            ),
            ...assign(
              craftAiLauncherPosition.bottom,
              unit.px(launcherPosition.bottom),
            ),
          };
          for (const [name, value] of Object.entries(styles))
            host.style.setProperty(name, value);
        }
        return mounted;
      },
      theme,
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
      return { ...rest, snapshot: buffer.snapshot() };
    },
    endpoint,
    get captureElement() {
      return capturedSignal()?.captureElement;
    },
    chatSections: chatSections ?? [],
    chatActions: chatActions ?? [],
    exportSections: exportSections ?? [],
    get selectedClipId() {
      return snapshotSignal().activeClipId;
    },
    get selectingTarget() {
      return selectingTarget();
    },
    pickTarget,
    cancelTargetSelection,
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
    dialog = openOverlay(
      99999,
      'auto',
      (host) =>
        mountCraftComponent(AiSendDialog, host, injector, {
          payload: function* () {
            return payload;
          },
          onClose: closeDialog as unknown as Output<() => void>,
        }),
      theme,
    );
  }

  function openSessionDialog(): void {
    const component = renderer ?? chatComponent;
    if (!component) return;
    closeLauncher();
    dialog = openOverlay(
      99999,
      'none',
      (host) =>
        mountCraftComponent(component, host, injector, {
          context: function* () {
            return uiContext;
          },
          onClose: closeDialog as unknown as Output<() => void>,
        } as never),
      theme,
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
      // The payload reads the registry when the user copies.
      takeSnapshot();
      openSessionDialog();
      return;
    }

    if (!ctx) return;
    closeDialog();
    openLegacyDialog({ ...ctx, snapshot: buffer.snapshot() });
  }

  function cancelTargetSelection(): void {
    selectingTarget.set(false);
    document.removeEventListener('pointerdown', blockTargetPress, true);
    document.removeEventListener('click', selectPageTarget, true);
    document.removeEventListener('keydown', cancelWithEscape, true);
  }

  function isPageTarget(
    event: Event,
  ): event is MouseEvent & { target: Element } {
    return (
      event.target instanceof Element &&
      !event.target.closest('[data-craft-ai-overlay]')
    );
  }

  function blockTargetPress(event: Event): void {
    if (!isPageTarget(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function selectPageTarget(event: MouseEvent): void {
    if (!isPageTarget(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = event.target;
    let component: Element | null = target;
    while (component && !aiComponentContexts.has(component))
      component = component.parentElement;
    const context = component ? aiComponentContexts.get(component) : undefined;
    cancelTargetSelection();
    onSelect({
      hostName: context?.hostName ?? target.tagName.toLowerCase(),
      tagList: context?.tagList ?? [],
      coords: { x: event.clientX, y: event.clientY },
      clickedElement: {
        tagName: target.tagName.toLowerCase(),
        textContent: (target.textContent ?? '').trim().slice(0, 500),
        outerHTML: target.outerHTML.slice(0, 2000),
      },
      captureElement: component ?? target,
      outerHTML: (component ?? target).outerHTML.slice(0, 2000),
    });
  }

  function cancelWithEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelTargetSelection();
  }

  function pickTarget(): void {
    closeMenu();
    selectingTarget.set(true);
    document.addEventListener('pointerdown', blockTargetPress, true);
    document.addEventListener('click', selectPageTarget, true);
    document.addEventListener('keydown', cancelWithEscape, true);
  }

  mountLauncher();
  destroyRef.onDestroy(() => {
    cancelTargetSelection();
    stopAiPerformance();
    closeMenu();
    dialog = closeOverlay(dialog);
    closeLauncher();
  });

  return {
    open(ctx: CapturedContext): void {
      cancelTargetSelection();
      closeMenu();
      // The session chat survives a right-click and absorbs the new element;
      // the legacy dialog freezes its payload, so it has to be rebuilt.
      if (!session) {
        dialog = closeOverlay(dialog);
        mountLauncher();
      }
      // Keep the context menu's snapshot callback behavior. The dialog reads
      // the current registry directly when it prepares its payload.
      takeSnapshot();

      menu = openOverlay(
        99998,
        'none',
        (host) =>
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
        theme,
      );
    },
  };
}

export interface SendContextToAiOptions {
  /** Partial light/dark palettes, using CSS colours or application colour tokens. */
  readonly theme?: SendContextTheme;
  /** Browser-accessible webhook URL. Omit it to keep the copy-only behavior. */
  readonly endpoint?: string;
  /** Start recording at app startup; false waits for the user to click Record. */
  readonly recording: boolean;
  /** Set false when a separate `provideCraftDebugSessionCapture` is installed. */
  readonly capture?: boolean;
  /**
   * Capture Craft-managed hover transitions for replay. Defaults to disabled
   * in Vite production builds and enabled in other modes.
   */
  readonly captureHover?: boolean;
  /**
   * Capture focus, focus-visible and active transitions for replay. Defaults
   * to disabled in Vite production builds and enabled in other modes.
   */
  readonly captureFocusActive?: boolean;
}

/** Opt-in session capture without mounting the AI context menu or launcher. */
export function provideCraftDebugSessionCapture(
  options: Readonly<{
    recording?: boolean;
    webSocketUrl?: string;
    /** Capture non-sensitive form values only after explicit opt-in. */
    captureInputValues?: boolean;
    /** Also allow sensitive form values when input capture is opted in. */
    captureSensitiveInputValues?: boolean;
    /**
     * Capture unfiltered browser storage at startup for local replay.
     * Requires a loopback WebSocket URL; defaults to false.
     */
    captureBrowserStorage?: boolean;
    /** EXPERIMENTAL: capture Craft and source$ arguments for local invocation replay. */
    captureReplayArguments?: boolean;
    /** Capture serialized restart points after the app reaches a stable state. */
    captureReplaySnapshots?: Readonly<{
      appVersion: string;
      debounceMs?: number;
    }>;
    /** Capture prompt() answers only after explicit opt-in. */
    capturePromptValues?: boolean;
    /**
     * Capture Craft-managed hover transitions for replay. Defaults to disabled
     * in Vite production builds and enabled in other modes.
     */
    captureHover?: boolean;
    /**
     * Capture focus, focus-visible and active transitions for replay. Defaults
     * to disabled in Vite production builds and enabled in other modes.
     */
    captureFocusActive?: boolean;
  }> = {},
): Provider[] {
  const recording = options.recording ?? true;
  let session: SendContextSession | undefined;
  let startupStorageSnapshot: Promise<BrowserStorageSnapshot> | undefined;
  let craftCallSequence = 0;
  let emittingCraftCapture = false;
  const activeCraftInvocations = new Map<string, string[]>();
  const captureCraftEvent = (
    activeSession: SendContextSession,
    phase: 'started' | 'succeeded' | 'failed',
    details: Parameters<SendContextSession['capture']>[2],
  ): void => {
    // Publishing a session event notifies its Craft-backed observables. Those
    // observables pass through this global wrapper too; ignore that nested
    // work so the recorder cannot recursively record its own notifications.
    if (emittingCraftCapture) return;
    emittingCraftCapture = true;
    try {
      activeSession.capture('craft', phase, details);
    } finally {
      emittingCraftCapture = false;
    }
  };
  const captureActionHost = (
    hostTags: readonly string[],
  ): string | undefined => {
    if (
      hostTags.some((tag) =>
        [
          'component:AiSendContextChat',
          'component:AiSendContextLauncher',
          'component:AiContextMenu',
          'component:AiSendDialog',
        ].some((prefix) => tag.startsWith(prefix)),
      )
    ) {
      return undefined;
    }
    return [...hostTags]
      .reverse()
      .map((tag) => tag.replace(/#\d+$/, ''))
      .find((tag) =>
        /^(method|query|mutation|asyncProcess|queryParams):.+/.test(tag),
      );
  };
  return [
    ...provideSendContextSession({
      captureInputValues: options.captureInputValues,
      captureSensitiveInputValues: options.captureSensitiveInputValues,
    }),
    ...(options.captureReplayArguments === true &&
    isLoopbackWebSocketUrl(options.webSocketUrl)
      ? [
          provideSendContextEventEnricher((event) => {
            if (
              event.kind !== 'custom' ||
              event.phase !== 'emitted' ||
              event.source !== 'source$' ||
              !event.replayAddress
            )
              return event;
            return {
              ...event,
              payload: {
                value: event.payload,
                replayInvocation: {
                  address: event.replayAddress,
                  args: [ɵserializeReplayArgument(event.payload)],
                },
              },
            };
          }),
        ]
      : []),
    ...(recording
      ? [
          provideAppInitializer(async () => {
            ɵinjectSendContextSession();
            if (startupStorageSnapshot) {
              const snapshot = await startupStorageSnapshot;
              session?.capture('storage', 'emitted', {
                name: INITIAL_BROWSER_STORAGE_EVENT,
                payload: { snapshotJson: JSON.stringify(snapshot) },
              });
            }
          }),
        ]
      : []),
    provideSendContextEventSource((createdSession) => {
      session = createdSession;
      if (
        recording &&
        options.captureBrowserStorage === true &&
        !isCraftDebugReplayLaunch() &&
        isLoopbackWebSocketUrl(options.webSocketUrl)
      )
        startupStorageSnapshot = captureBrowserStorageSnapshot();
      const disconnectBrowserStorageCheckpoints = startupStorageSnapshot
        ? connectBrowserStorageCheckpoints(createdSession, {
            baseline: startupStorageSnapshot,
          })
        : undefined;
      const disconnectDialogCapture = recording
        ? connectDebugSessionDialogCapture(createdSession, {
            capturePromptValues: options.capturePromptValues,
          })
        : undefined;
      const disconnectScrollCapture = recording
        ? connectDebugSessionScrollCapture(createdSession)
        : undefined;
      const viteProduction =
        (
          import.meta as ImportMeta & {
            readonly env?: { readonly PROD?: boolean };
          }
        ).env?.PROD === true;
      const disconnectHoverCapture =
        recording &&
        ((options.captureHover ?? !viteProduction) ||
          (options.captureFocusActive ?? !viteProduction))
          ? connectDebugSessionHoverCapture(createdSession, {
              hover: options.captureHover ?? !viteProduction,
              focusActive: options.captureFocusActive ?? !viteProduction,
            })
          : undefined;
      const disconnectFormCapture = recording
        ? connectDebugSessionFormCapture(createdSession, {
            captureInputValues: options.captureInputValues,
            captureSensitiveInputValues: options.captureSensitiveInputValues,
          })
        : undefined;
      const disconnectFetchCapture =
        recording &&
        options.captureReplayArguments === true &&
        isLoopbackWebSocketUrl(options.webSocketUrl)
          ? connectDebugSessionFetchCapture(createdSession)
          : undefined;
      const disconnectPrimitiveCapture =
        recording &&
        !isCraftDebugReplayLaunch() &&
        typeof window !== 'undefined'
          ? (() => {
              const registry = ɵinjectCraftPrimitiveRegistry();
              let paused = false;
              const replayPauseListener = (event: Event) => {
                const detail = (event as CustomEvent<unknown>).detail;
                paused =
                  typeof detail === 'object' &&
                  detail !== null &&
                  'paused' in detail &&
                  detail.paused === true;
              };
              window.addEventListener(
                CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
                replayPauseListener,
              );
              const unsubscribe = registry.onChange((address) => {
                if (paused || !createdSession.activeClip) return;
                const entry = registry.get(address);
                if (!entry || entry.kind === 'queryParams') return;
                createdSession.capture('primitive', 'emitted', {
                  name: 'primitive-change',
                  payload: {
                    address,
                    primitiveKind: entry.kind,
                    ...(entry.status ? { status: entry.status() } : {}),
                    ...(entry.error ? { error: entry.error() } : {}),
                  },
                  state: registry.capture([entry]),
                });
              });
              return () => {
                unsubscribe();
                window.removeEventListener(
                  CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
                  replayPauseListener,
                );
              };
            })()
          : undefined;
      // Replaying an app session can open the live context timeline inside the
      // target iframe. Recording long tasks generated by that timeline would
      // continuously add rows that trigger more rendering and more long tasks.
      const disconnectPerformanceCapture =
        recording && !isCraftDebugReplayLaunch()
          ? connectDebugSessionPerformanceCapture(createdSession)
          : undefined;
      const disconnectViewportCapture = recording
        ? connectDebugSessionViewportCapture(createdSession)
        : undefined;
      let disconnectReplaySnapshots: (() => void) | undefined;
      if (recording) {
        createdSession.startRecord('Application session');
        if (options.captureReplaySnapshots) {
          const primitiveRegistry = ɵinjectCraftPrimitiveRegistry();
          const storageRegistry = ɵinjectPersistedStorageSnapshotRegistry();
          const craftRouter = ɵinjectCraftRouterRuntime();
          disconnectReplaySnapshots = connectReplaySnapshotCapture({
            session: createdSession,
            appVersion: options.captureReplaySnapshots.appVersion,
            debounceMs: options.captureReplaySnapshots.debounceMs,
            route: () => craftRouter?.url,
            primitives: () => primitiveRegistry.capture(),
            storage: () => storageRegistry.capture(),
            isQuiescent: () =>
              activeCraftInvocations.size === 0 &&
              primitiveRegistry.list().every((entry) => {
                const status = entry.status?.().toLowerCase();
                return (
                  status === undefined ||
                  !/(loading|pending|running|debouncing|refreshing)/.test(
                    status,
                  )
                );
              }),
            subscribe: (onChange) => {
              const unsubscribePrimitive = primitiveRegistry.onChange(onChange);
              const eventSubscription = createdSession.events$.subscribe({
                next: onChange,
              });
              return () => {
                unsubscribePrimitive();
                eventSubscription.unsubscribe();
              };
            },
          });
        }
        // Keep replay capture in memory for comparison without archiving a new
        // session when the dashboard reloads the target URL.
        if (options.webSocketUrl && !isCraftDebugReplayLaunch()) {
          const disconnectPersistence = connectDebugSessionPersistence(
            createdSession,
            options.webSocketUrl,
          );
          return () => {
            disconnectDialogCapture?.();
            disconnectScrollCapture?.();
            disconnectHoverCapture?.();
            disconnectFormCapture?.();
            disconnectFetchCapture?.();
            disconnectPrimitiveCapture?.();
            disconnectPerformanceCapture?.();
            disconnectViewportCapture?.();
            disconnectBrowserStorageCheckpoints?.();
            disconnectReplaySnapshots?.();
            disconnectPersistence();
          };
        }
      }
      return () => {
        disconnectDialogCapture?.();
        disconnectScrollCapture?.();
        disconnectHoverCapture?.();
        disconnectFormCapture?.();
        disconnectFetchCapture?.();
        disconnectPrimitiveCapture?.();
        disconnectPerformanceCapture?.();
        disconnectViewportCapture?.();
        disconnectBrowserStorageCheckpoints?.();
        disconnectReplaySnapshots?.();
      };
    }),
    provideSendContextEventFilter(() => session?.activeClip !== undefined),
    provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (factory, thisArg, args) {
        const activeSession = session;
        if (emittingCraftCapture || !activeSession?.activeClip) {
          return yield* factory.apply(thisArg, args);
        }
        let hostTags: readonly string[];
        try {
          hostTags = yield* HostTag();
        } catch {
          return yield* factory.apply(thisArg, args);
        }
        const actionHost = captureActionHost(hostTags);
        if (!actionHost) return yield* factory.apply(thisArg, args);
        const factoryName = factory.name.trim();
        const name =
          factoryName && factoryName !== 'current' ? factoryName : actionHost;
        const operationId = `craft-call-${++craftCallSequence}`;
        const correlationId = getCurrentStartCorrelationId() ?? undefined;
        const invocationStack = correlationId
          ? activeCraftInvocations.get(correlationId)
          : undefined;
        const details = {
          name,
          operationId,
          ...(correlationId ? { correlationId } : {}),
          // Keep only calls with a causal interaction context. Startup and
          // reactive background work without a correlation id is mostly noise.
          // These traces explain execution order; replay compares their effects
          // through primitive state and HTTP results instead.
          payload: {
            comparable: false,
            host: actionHost,
            hostTags: hostTags.map((tag) => tag.replace(/#\d+$/, '')),
            ...(options.captureReplayArguments === true &&
            isLoopbackWebSocketUrl(options.webSocketUrl) &&
            actionHost.startsWith('method:')
              ? {
                  replayInvocation: {
                    address: hostTags.join(' / '),
                    args: args.map((value) => ɵserializeReplayArgument(value)),
                    ...(invocationStack?.length
                      ? { parentOperationId: invocationStack.at(-1) }
                      : {}),
                  },
                }
              : {}),
            ...(typeof location === 'undefined'
              ? {}
              : { route: location.pathname }),
          },
        };
        if (correlationId) captureCraftEvent(activeSession, 'started', details);
        if (correlationId) {
          const stack = invocationStack ?? [];
          if (!invocationStack)
            activeCraftInvocations.set(correlationId, stack);
          stack.push(operationId);
        }
        try {
          const result = yield* factory.apply(thisArg, args);
          if (correlationId)
            captureCraftEvent(activeSession, 'succeeded', details);
          return result;
        } catch (error) {
          captureCraftEvent(activeSession, 'failed', {
            ...details,
            response:
              error instanceof Error ? { name: error.name } : { failed: true },
          });
          throw error;
        } finally {
          if (correlationId) {
            const stack = activeCraftInvocations.get(correlationId);
            if (stack) {
              const index = stack.lastIndexOf(operationId);
              if (index >= 0) stack.splice(index, 1);
              if (stack.length === 0)
                activeCraftInvocations.delete(correlationId);
            }
          }
        }
      },
    ),
  ];
}

function isLoopbackWebSocketUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.replace(/^\[|\]$/g, '');
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    );
  } catch {
    return false;
  }
}

export function ɵserializeReplayArgument(
  value: unknown,
  ancestors = new WeakSet<object>(),
): unknown {
  if (value === undefined) return { $craftReplayUndefined: true };
  if (typeof value === 'bigint')
    return { $craftReplayBigInt: value.toString() };
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      return {
        $craftReplayNumber: Object.is(value, -0) ? '-0' : String(value),
      };
    return value;
  }
  if (typeof value === 'function' || typeof value === 'symbol')
    return { $craftReplayUnsupported: typeof value };
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (value instanceof Date)
    return Number.isNaN(value.getTime())
      ? { $craftReplayUnsupported: 'invalid-date' }
      : { $craftReplayDate: value.toISOString() };
  if (typeof Event !== 'undefined' && value instanceof Event) {
    const eventInit: Record<string, unknown> = {
      bubbles: value.bubbles,
      cancelable: value.cancelable,
      composed: value.composed,
    };
    if (value instanceof MouseEvent)
      Object.assign(eventInit, {
        clientX: value.clientX,
        clientY: value.clientY,
        screenX: value.screenX,
        screenY: value.screenY,
        button: value.button,
        buttons: value.buttons,
        altKey: value.altKey,
        ctrlKey: value.ctrlKey,
        metaKey: value.metaKey,
        shiftKey: value.shiftKey,
      });
    if (value instanceof KeyboardEvent)
      Object.assign(eventInit, {
        key: value.key,
        code: value.code,
        location: value.location,
        repeat: value.repeat,
        altKey: value.altKey,
        ctrlKey: value.ctrlKey,
        metaKey: value.metaKey,
        shiftKey: value.shiftKey,
      });
    if (typeof InputEvent !== 'undefined' && value instanceof InputEvent)
      Object.assign(eventInit, {
        data: value.data,
        inputType: value.inputType,
        isComposing: value.isComposing,
      });
    const replayTarget =
      value.target instanceof Element
        ? ɵcaptureCraftReplayTarget(
            value.target,
            value instanceof MouseEvent
              ? { clientX: value.clientX, clientY: value.clientY }
              : undefined,
          )
        : undefined;
    if (value.target instanceof Element && !replayTarget)
      return { $craftReplayUnsupported: 'event-target-without-craft-identity' };
    return {
      $craftReplayEvent: {
        type: value.type,
        eventInit,
        ...(replayTarget ? { replayTarget } : {}),
      },
    };
  }
  if (typeof value !== 'object')
    return { $craftReplayUnsupported: typeof value };
  if (ancestors.has(value))
    return { $craftReplayUnsupported: 'circular-reference' };
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    return { $craftReplayUnsupported: 'binary-object' };
  if (Array.isArray(value)) {
    ancestors.add(value);
    try {
      return value.map((entry) => ɵserializeReplayArgument(entry, ancestors));
    } finally {
      ancestors.delete(value);
    }
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    return { $craftReplayUnsupported: 'non-plain-object' };
  ancestors.add(value);
  try {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        ɵserializeReplayArgument(entry, ancestors),
      ]),
    );
  } catch {
    return { $craftReplayUnsupported: 'object-serialization-failed' };
  } finally {
    ancestors.delete(value);
  }
}

export function provideSendContextToAi(
  options: SendContextToAiOptions,
): Provider[] {
  return [
    ...(options.capture === false
      ? []
      : provideCraftDebugSessionCapture({
          recording: options.recording,
          captureHover: options.captureHover,
          captureFocusActive: options.captureFocusActive,
        })),
    provideSendContextChatComponent(() => AiSendContextChat),
    provideSendContextContextMenuComponent(() => AiContextMenu),
    provideSendContextLauncherComponent(() => AiSendContextLauncher),
    provideSendContextChatSectionsDefault(),
    provideSendContextChatActionsDefault(),
    provideSendContextExportSectionsDefault(),
    provideSendContextToAiBuffer(() =>
      createSendContextToAiBuffer(ɵinjectAppSnapshotRegistry()),
    ) as Provider,
    provideAiContextMenuController(() =>
      createAiContextMenuController({
        injector: inject(Injector),
        buffer: ɵinjectSendContextToAiBuffer()!,
        takeSnapshot: ɵinjectTakeAppSnapshot() ?? (() => undefined),
        destroyRef: inject(DestroyRef),
        session: ɵinjectSendContextSession() ?? undefined,
        renderer: ɵinjectSendContextUiRenderer() ?? undefined,
        chatComponent: ɵinjectSendContextChatComponent() ?? undefined,
        contextMenuComponent:
          ɵinjectSendContextContextMenuComponent() ?? undefined,
        launcherComponent: ɵinjectSendContextLauncherComponent() ?? undefined,
        chatSections: ɵinjectSendContextChatSections(),
        chatActions: ɵinjectSendContextChatActions(),
        exportSections: ɵinjectSendContextExportSections(),
        endpoint: options.endpoint,
        theme: options.theme,
      }),
    ),
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
          controller: ɵinjectAiContextMenuController()!,
          destroyRef: inject(DestroyRef),
        });

        return yield* factory.apply(thisArg, args);
      },
    ),
    provideComponentMonitoring(() => {
      const el = inject(ElementRef).nativeElement as HTMLElement;
      const tagList = inject(HOST_TAG_LIST);
      const injector = inject(Injector);
      const controller = ɵinjectAiContextMenuController()!;
      const destroyRef = inject(DestroyRef);
      // Resolve the direct snapshot reader before the overlay is opened.
      ɵinjectSendContextToAiBuffer();

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
    TakeAppSnapshot: typeof ɵinjectTakeAppSnapshot;
  };
}>;
