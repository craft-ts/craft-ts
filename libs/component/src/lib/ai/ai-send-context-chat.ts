import {
  CRAFT_TEMPORAL_RUNTIME,
  CraftHttpClient,
  craftMethod,
  craftUse,
  isCraftException,
  mutation,
  state,
  type CraftTemporalRuntime as CraftTemporalRuntimeApi,
  type SendContextEvent,
  type TemporalTaskHandle,
} from '@craft-ts/core';
import { ɵtoCraftService as toCraftService } from '@craft-ts/core';
import { liveRegion } from '../a11y';
import { craftComponent } from '../component';
import { DestroyRef, inject } from '../host-runtime';
import { forNode } from '../for-node';
import {
  button,
  div,
  fieldset,
  footer,
  header,
  input,
  label,
  legend,
  li,
  ol,
  p,
  section,
  span,
  strong,
  textarea,
} from '../hyperscript';
import type { CraftComponent, Input, Output } from '../types';
import { captureAiDomStyles } from './ai-dom-capture';
import { AI_OVERLAY_THEME } from './ai-overlay-theme';
import {
  buildSendContextWebhookPayload,
  DEFAULT_SEND_CONTEXT_PROMPT_OPTIONS,
  describeTarget,
  formatEventLine,
  safeJson,
  type SendContextWebhookPayload,
  type SendContextPromptOptions,
} from './send-context-prompt';
import type { SendContextUiContext } from './send-context-ui.tokens';

const { CraftTemporalRuntime } = toCraftService({
  name: 'CraftTemporalRuntime',
  providedIn: 'global',
  token: CRAFT_TEMPORAL_RUNTIME,
}) as unknown as {
  CraftTemporalRuntime: () => Generator<
    never,
    CraftTemporalRuntimeApi,
    unknown
  >;
};

/** The timeline is a debugging view, not a log: only the tail is readable. */
const VISIBLE_EVENTS = 100;

/** How much of the panel must stay inside the viewport while dragging. */
const DRAG_MARGIN = 8;

/**
 * The overlay's own components. Their DOM events are hidden from the timeline
 * and left out of the prompt: ticking a checkbox here would otherwise bury the
 * app's events this panel exists to show.
 */
const AI_OVERLAY_COMPONENTS = [
  'AiSendContextChat',
  'AiSendContextLauncher',
  'AiContextMenu',
  'AiSendDialog',
];

function isAiOverlayEvent(event: SendContextEvent): boolean {
  if (event.kind !== 'dom' || typeof event.name !== 'string') return false;
  const name = event.name;
  return AI_OVERLAY_COMPONENTS.some((component) =>
    name.startsWith(`${component}:`),
  );
}

const SEND_CONTEXT_WEBHOOK_TIMEOUT_MS = 10_000;

function formatWebhookError(error: unknown): string {
  if (isCraftException(error) && error._tag === 'HttpError') {
    const response = (
      error.payload as { error?: { status?: unknown; error?: unknown } }
    ).error;
    const status = response?.status;
    if (typeof status === 'number' && status > 0) {
      return `Could not send context (HTTP ${status}).`;
    }
    const cause = response?.error;
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      return 'Could not send context: the webhook timed out.';
    }
    return 'Could not send context: the webhook is unreachable.';
  }
  return 'Could not send context to the webhook.';
}

/** How far the panel has been dragged from its default bottom-right anchor. */
export interface PanelOffset {
  readonly x: number;
  readonly y: number;
}

/** One timeline row, pre-formatted: the template only ever renders strings. */
export interface SendContextTimelineRow {
  readonly id: string;
  readonly time: string;
  readonly phase: string;
  readonly label: string;
  readonly title: string;
}

/** One captured element, addressed by position so removal stays primitive. */
export interface SendContextTargetRow {
  readonly key: string;
  readonly label: string;
  readonly index: number;
}

// The UI context carries an rxjs `Observable`, and `SendContextEventKind` is an
// open `string & {}` union — neither survives the template-context projection.
// So the factory reads the context and hands the template flat rows.
type ChatContext = {
  onClose: () => void;
  visibleEvents: () => readonly SendContextTimelineRow[];
  eventCount: () => number;
  targets: () => readonly SendContextTargetRow[];
  recording: () => boolean;
  removeTarget: (index: number) => void;
  instruction: () => string;
  writeInstruction: (value: string) => Generator<unknown, unknown, unknown>;
  options: () => SendContextPromptOptions;
  writeOptions: (
    value: SendContextPromptOptions,
  ) => Generator<unknown, unknown, unknown>;
  status: () => string;
  error: () => string;
  busy: () => boolean;
  panelOffset: () => PanelOffset;
  startDrag: (event: PointerEvent) => void;
  resetPanelOffset: () => void;
  toggleRecord: () => void;
  clearTimeline: () => void;
  copyPrompt: () => void;
  exportJson: () => void;
  endpoint?: string;
  sendPayload?: () => void;
  retrySend?: () => void;
  copyPayload?: () => void;
};

type ChatFactoryContext = Omit<ChatContext, 'onClose'> & {
  onClose: Output<() => void>;
};

/**
 * Default floating chat for the session timeline: the captured elements, the
 * recorded event timeline, an instruction box, and the per-section switches
 * that decide what the copied prompt actually carries.
 */
export const AiSendContextChat: CraftComponent<{
  context: Input<SendContextUiContext>;
  onClose: Output<() => void>;
}> = craftComponent(
  'AiSendContextChat',
  {
    styles: `${AI_OVERLAY_THEME}
      :scope {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        padding: 20px;
        pointer-events: none;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        color: var(--craft-ai-text);
      }
      :scope .craft-ai-chat {
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: min(460px, 100%);
        max-height: min(760px, 88vh);
        overflow: auto;
        background: var(--craft-ai-bg);
        border: 1px solid var(--craft-ai-border-subtle);
        border-radius: 12px;
        box-shadow: 0 20px 60px var(--craft-ai-shadow);
        padding: 16px;
      }
      :scope .craft-ai-chat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        cursor: grab;
        /* Let the pointer handlers own touch drags instead of scrolling. */
        touch-action: none;
        user-select: none;
      }
      :scope .craft-ai-chat-header:active {
        cursor: grabbing;
      }
      :scope .craft-ai-title {
        font-size: 14px;
        font-weight: 600;
      }
      :scope .craft-ai-chat-close {
        background: transparent;
        border: none;
        font-size: 20px;
        line-height: 1;
        padding: 0 4px;
        color: var(--craft-ai-text-muted);
        cursor: pointer;
      }
      :scope .craft-ai-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      :scope .craft-ai-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--craft-ai-text-muted);
      }
      :scope .craft-ai-targets {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      :scope .craft-ai-target {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
        background: var(--craft-ai-surface-accent);
        color: var(--craft-ai-accent-text);
        border-radius: 999px;
        padding: 3px 4px 3px 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
      }
      :scope .craft-ai-target-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      :scope .craft-ai-target-remove {
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 999px;
      }
      :scope .craft-ai-target-remove:hover {
        background: var(--craft-ai-accent-soft);
      }
      :scope .craft-ai-empty {
        margin: 0;
        color: var(--craft-ai-text-muted);
        font-size: 12px;
      }
      :scope .craft-ai-timeline {
        margin: 0;
        padding: 6px 8px;
        list-style: none;
        max-height: 190px;
        overflow: auto;
        background: var(--craft-ai-surface);
        border: 1px solid var(--craft-ai-border-subtle);
        border-radius: 6px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        line-height: 1.6;
      }
      :scope .craft-ai-timeline li {
        display: flex;
        gap: 6px;
        white-space: nowrap;
      }
      :scope .craft-ai-event-time {
        color: var(--craft-ai-text-muted);
      }
      :scope .craft-ai-event-name {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      :scope .craft-ai-phase {
        text-transform: uppercase;
        font-size: 10px;
        letter-spacing: 0.03em;
      }
      :scope .craft-ai-phase--failed { color: var(--craft-ai-phase-failed); }
      :scope .craft-ai-phase--succeeded { color: var(--craft-ai-phase-succeeded); }
      :scope .craft-ai-phase--started { color: var(--craft-ai-phase-started); }
      :scope .craft-ai-phase--emitted { color: var(--craft-ai-phase-emitted); }
      :scope .craft-ai-textarea {
        width: 100%;
        box-sizing: border-box;
        resize: vertical;
        font: inherit;
        border: 1px solid var(--craft-ai-border);
        border-radius: 6px;
        padding: 8px 10px;
        color: var(--craft-ai-text);
        background: var(--craft-ai-control-bg);
        caret-color: var(--craft-ai-text);
      }
      :scope .craft-ai-textarea::placeholder {
        color: var(--craft-ai-text-muted);
        opacity: 1;
      }
      :scope .craft-ai-option input[type='checkbox'] {
        accent-color: var(--craft-ai-accent);
      }
      :scope .craft-ai-textarea:focus-visible {
        outline: 2px solid var(--craft-ai-focus);
        outline-offset: -1px;
      }
      :scope .craft-ai-options {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 6px 12px;
        margin: 0;
        padding: 10px;
        border: 1px solid var(--craft-ai-border-subtle);
        border-radius: 6px;
      }
      :scope .craft-ai-options legend {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--craft-ai-text-muted);
        padding: 0 4px;
      }
      :scope .craft-ai-option {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
      }
      :scope .craft-ai-chat-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      :scope .craft-ai-chat-actions .spacer {
        flex: 1;
      }
      :scope button {
        font: inherit;
        font-size: 12px;
        border: 1px solid var(--craft-ai-border);
        background: var(--craft-ai-control-bg);
        color: var(--craft-ai-text);
        border-radius: 6px;
        padding: 7px 11px;
        cursor: pointer;
      }
      :scope button:hover:not(:disabled) {
        background: var(--craft-ai-surface);
      }
      :scope button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      :scope button.primary {
        background: var(--craft-ai-accent);
        border-color: var(--craft-ai-accent);
        color: #ffffff;
      }
      :scope button.primary:hover:not(:disabled) {
        background: var(--craft-ai-accent-hover);
      }
      :scope button.recording {
        background: var(--craft-ai-danger);
        border-color: var(--craft-ai-danger);
        color: #ffffff;
      }
      :scope .craft-ai-success {
        margin: 0;
        color: var(--craft-ai-success);
        font-size: 12px;
      }
      :scope .craft-ai-warning {
        margin: 0;
        color: var(--craft-ai-warning);
        font-size: 12px;
      }
    `,
  },
  function* (
    context: Input<SendContextUiContext>,
    onClose: Output<() => void>,
  ): Generator<unknown, ChatFactoryContext, unknown> {
    const temporalRuntime = yield* CraftTemporalRuntime();

    // Reactive values carry `unique symbol`s that declaration emit cannot name
    // (TS4023), so — as in `AiSendDialog` — the signals stay local and the
    // template context exposes plain accessors only.
    type InstructionState = (() => string) & {
      setInstruction: (value: string) => Generator<unknown, unknown, unknown>;
    };
    type OptionsState = (() => SendContextPromptOptions) & {
      setOptions: (
        value: SendContextPromptOptions,
      ) => Generator<unknown, unknown, unknown>;
    };
    type StatusState = (() => string) & {
      setStatus: (value: string) => Generator<unknown, unknown, unknown>;
    };
    type ErrorState = (() => string) & {
      setError: (value: string) => Generator<unknown, unknown, unknown>;
    };
    type BusyState = (() => boolean) & {
      setBusy: (value: boolean) => Generator<unknown, unknown, unknown>;
    };
    type PanelOffsetState = (() => PanelOffset) & {
      setPanelOffset: (
        value: PanelOffset,
      ) => Generator<unknown, unknown, unknown>;
    };

    const instruction = yield* state('instruction', '', ({ set }) => ({
      setInstruction: (value: string) => set(value),
    })) as unknown as Generator<never, InstructionState, unknown>;
    const promptOptions = yield* state(
      'promptOptions',
      DEFAULT_SEND_CONTEXT_PROMPT_OPTIONS,
      ({ set }) => ({
        setOptions: (value: SendContextPromptOptions) => set(value),
      }),
    ) as unknown as Generator<never, OptionsState, unknown>;
    const status = yield* state('status', '', ({ set }) => ({
      setStatus: (value: string) => set(value),
    })) as unknown as Generator<never, StatusState, unknown>;
    const error = yield* state('error', '', ({ set }) => ({
      setError: (value: string) => set(value),
    })) as unknown as Generator<never, ErrorState, unknown>;
    const busy = yield* state('busy', false, ({ set }) => ({
      setBusy: (value: boolean) => set(value),
    })) as unknown as Generator<never, BusyState, unknown>;
    const panelOffset = yield* state(
      'panelOffset',
      { x: 0, y: 0 } as PanelOffset,
      ({ set }) => ({
        setPanelOffset: (value: PanelOffset) => set(value),
      }),
    ) as unknown as Generator<never, PanelOffsetState, unknown>;

    const setStatus: (value: string) => void = craftMethod(
      'setStatus',
      function* (value: string) {
        yield* status.setStatus(value);
      },
    );
    const setError: (value: string) => void = craftMethod(
      'setError',
      function* (value: string) {
        yield* error.setError(value);
      },
    );
    const setBusy: (value: boolean) => void = craftMethod(
      'setBusy',
      function* (value: boolean) {
        yield* busy.setBusy(value);
      },
    );
    const setPanelOffset: (value: PanelOffset) => void = craftMethod(
      'setPanelOffset',
      function* (value: PanelOffset) {
        yield* panelOffset.setPanelOffset(value);
      },
    );

    let statusTimer: TemporalTaskHandle | null = null;
    const flashStatus = (message: string): void => {
      setStatus(message);
      statusTimer?.cancel();
      statusTimer = temporalRuntime.schedule(() => setStatus(''), 2500, {
        kind: 'ai-chat-status',
        owner: 'ai-send-context-chat',
      });
    };

    const readContext = (): SendContextUiContext => craftUse(context());
    const configuredEndpoint = readContext().endpoint;

    const sendMutation = configuredEndpoint
      ? yield* mutation('sendContextToAi', {
          method: (payload: SendContextWebhookPayload) => payload,
          loader: function* ({ params }) {
            const request = yield* CraftHttpClient.post(({ response }) => ({
              url: configuredEndpoint,
              payload: params,
              timeout: SEND_CONTEXT_WEBHOOK_TIMEOUT_MS,
              success: response<unknown>(),
            }));
            return request.then(
              (result) => {
                if (isCraftException(result)) {
                  setBusy(false);
                  setError(formatWebhookError(result));
                  return result;
                }
                setBusy(false);
                flashStatus('Context sent to the webhook ✓');
                return result;
              },
              (caught) => {
                setBusy(false);
                setError(formatWebhookError(caught));
                throw caught;
              },
            );
          },
        })
      : undefined;

    /** The session timeline, minus the noise this panel makes itself. */
    const appEvents = (): readonly SendContextEvent[] => {
      const events = readContext().events.filter(
        (event) => !isAiOverlayEvent(event),
      );
      if (!configuredEndpoint) return events;

      const webhookOperationIds = new Set(
        events.flatMap((event) => {
          if (
            event.kind !== 'http' ||
            event.phase !== 'started' ||
            !event.operationId ||
            !event.payload ||
            typeof event.payload !== 'object'
          ) {
            return [];
          }
          const url = (event.payload as { url?: unknown }).url;
          return url === configuredEndpoint ? [event.operationId] : [];
        }),
      );
      return events.filter(
        (event) =>
          event.operationId === undefined ||
          !webhookOperationIds.has(event.operationId),
      );
    };
    const readOptions = (): SendContextPromptOptions =>
      craftUse(promptOptions());
    const readInstruction = (): string => craftUse(instruction());

    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    // Dismiss on `pointerdown`, not `click`. The chat is opened from a click
    // handler — on the launcher or on "Add to AI context" — and that very
    // event is still bubbling towards `document` when this listener goes up,
    // so a `click` listener would close the chat on the spot. (Deferring it to
    // a microtask does not help: the browser runs a microtask checkpoint
    // between two listeners of the same dispatch.) The press that opened the
    // chat is already over by then, so the next `pointerdown` is a real one.
    const onOutsidePress = (event: PointerEvent): void => {
      // A secondary press is the start of the context-menu flow used to add
      // another element. Do not close the chat before the subsequent
      // `contextmenu` event can update its live context.
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.craft-ai-chat')) return;
      // The context menu lives in its own overlay: pressing "Add to AI
      // context" is outside the panel but must not close it either.
      if (target.closest('[data-craft-ai-overlay]')) return;
      onClose();
    };
    // Plain listeners, not `fromEventToSource$`: a craft source emits a
    // `custom` event into the very timeline this panel is here to show, so the
    // inspector would be recording its own keystrokes and presses.
    document.addEventListener('keydown', onEscape);
    document.addEventListener('pointerdown', onOutsidePress);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('pointerdown', onOutsidePress);
    });

    let drag: {
      readonly pointerId: number;
      readonly startX: number;
      readonly startY: number;
      readonly originX: number;
      readonly originY: number;
      readonly baseLeft: number;
      readonly baseTop: number;
      readonly width: number;
      readonly height: number;
    } | null = null;

    /** Keeps the panel reachable: it can never be dragged off-screen. */
    function clampOffset(
      base: number,
      size: number,
      viewport: number,
      wanted: number,
    ): number {
      const room = viewport - size - DRAG_MARGIN;
      const lower = Math.min(DRAG_MARGIN, room);
      const upper = Math.max(DRAG_MARGIN, room);
      return Math.min(Math.max(wanted, lower - base), upper - base);
    }

    const startDrag = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      const handle = event.currentTarget as HTMLElement;
      // The close button shares the header; a click on it is not a drag.
      if (event.target instanceof Element && event.target.closest('button')) {
        return;
      }
      const panel = handle.closest<HTMLElement>('.craft-ai-chat');
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const current = craftUse(panelOffset());
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: current.x,
        originY: current.y,
        // Where the panel would sit with no offset applied.
        baseLeft: rect.left - current.x,
        baseTop: rect.top - current.y,
        width: rect.width,
        height: rect.height,
      };
      handle.setPointerCapture(event.pointerId);
      // Declarative `pointermove` props go through craft's DOM event hook,
      // which records one timeline entry per frame of the drag. These stay
      // imperative so a drag costs a single `pointerdown` entry.
      handle.addEventListener('pointermove', moveDrag);
      handle.addEventListener('pointerup', endDrag);
      handle.addEventListener('pointercancel', endDrag);
      event.preventDefault();
    };

    const moveDrag = (event: PointerEvent): void => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      setPanelOffset({
        x: clampOffset(
          drag.baseLeft,
          drag.width,
          window.innerWidth,
          drag.originX + (event.clientX - drag.startX),
        ),
        y: clampOffset(
          drag.baseTop,
          drag.height,
          window.innerHeight,
          drag.originY + (event.clientY - drag.startY),
        ),
      });
    };

    const endDrag = (event: PointerEvent): void => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag = null;
      const handle = event.currentTarget as HTMLElement;
      handle.removeEventListener('pointermove', moveDrag);
      handle.removeEventListener('pointerup', endDrag);
      handle.removeEventListener('pointercancel', endDrag);
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    };

    const resetPanelOffset = (): void => setPanelOffset({ x: 0, y: 0 });

    const copyToClipboard = (text: string, message: string): void => {
      const clipboard = navigator.clipboard;
      if (!clipboard) {
        setError('Clipboard access is unavailable in this browser.');
        return;
      }
      void clipboard
        .writeText(text)
        .then(() => flashStatus(message))
        .catch(() => setError('Could not write to the clipboard.'));
    };

    let pendingWebhookPayload: SendContextWebhookPayload | undefined;

    const preparePayload = (): SendContextWebhookPayload => {
      const text = readInstruction().trim();
      const options = readOptions();
      const ui = readContext();
      const componentCapture =
        options.includeDomStyles && ui.captureElement
          ? captureAiDomStyles(ui.captureElement)
          : undefined;
      const pageCapture = options.includePageDomStyles
        ? captureAiDomStyles(document.documentElement, {
            maxBytes: 1024 * 1024,
            maxNodes: 10000,
          })
        : undefined;
      return buildSendContextWebhookPayload(
        {
          instruction: text,
          targets: ui.targets,
          events: appEvents(),
          payload: ui.payload,
          timelineJson: options.includeTimelineJson
            ? timelineJson()
            : undefined,
          captures: { component: componentCapture, page: pageCapture },
        },
        options,
      );
    };

    const copyPrompt = (): void => {
      if (craftUse(busy())) return;

      setError('');
      setStatus('');
      setBusy(true);
      // The DOM + CSS capture walks the tree synchronously; yield to the
      // browser first so the disabled state actually paints.
      setTimeout(() => {
        try {
          copyToClipboard(
            preparePayload().prompt,
            'Prompt copied to the clipboard ✓',
          );
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Could not build the prompt.',
          );
        } finally {
          setBusy(false);
        }
      }, 0);
    };

    const sendPayload = (): void => {
      if (!sendMutation || craftUse(busy())) return;
      setError('');
      setStatus('');
      setBusy(true);
      setTimeout(() => {
        try {
          pendingWebhookPayload = preparePayload();
          sendMutation.mutate(pendingWebhookPayload);
        } catch (caught) {
          setBusy(false);
          setError(
            caught instanceof Error
              ? caught.message
              : 'Could not build the webhook payload.',
          );
        }
      }, 0);
    };

    const retrySend = (): void => {
      if (!sendMutation || !pendingWebhookPayload || craftUse(busy())) return;
      setError('');
      setStatus('');
      setBusy(true);
      sendMutation.mutate(pendingWebhookPayload);
    };

    const copyPayload = (): void => {
      if (!pendingWebhookPayload || craftUse(busy())) return;
      copyToClipboard(
        safeJson(pendingWebhookPayload, '[unserializable payload]'),
        'Payload copied to the clipboard ✓',
      );
    };

    /** The same view the timeline shows, as JSON — not the raw session dump. */
    const timelineJson = (): string => {
      const ui = readContext();
      const clip = ui.selectedClipId
        ? ui.clips.find((entry) => entry.id === ui.selectedClipId)
        : undefined;
      const events = clip
        ? appEvents().filter((event) => clip.eventIds.includes(event.id))
        : appEvents();
      return safeJson(
        { events, ...(clip ? { clip } : { clips: ui.clips }) },
        '[unserializable timeline]',
      );
    };

    const exportJson = (): void => {
      copyToClipboard(
        timelineJson(),
        'Timeline JSON copied to the clipboard ✓',
      );
    };

    const toggleRecord = (): void => {
      const ui = readContext();
      if (ui.recording) {
        ui.session.stopRecord();
        flashStatus('Recording stopped.');
        return;
      }
      ui.session.startRecord();
      flashStatus('Recording…');
    };

    const clearTimeline = (): void => {
      readContext().session.clear();
      flashStatus('Timeline cleared.');
    };

    return {
      onClose,
      visibleEvents: () => {
        const events = appEvents();
        const tail =
          events.length > VISIBLE_EVENTS
            ? events.slice(events.length - VISIBLE_EVENTS)
            : events;
        return tail.map(toTimelineRow);
      },
      eventCount: () => appEvents().length,
      targets: () =>
        readContext().targets.map((target, index) => ({
          // Two right-clicks can capture the same markup, so the position is
          // part of the key: `forNode` rejects duplicates.
          key: `${index}:${target.outerHTML ?? target.tagName}`,
          label: describeTarget(target),
          index,
        })),
      recording: () => readContext().recording,
      removeTarget: (index: number) => {
        const ui = readContext();
        const target = ui.targets[index];
        if (target) ui.removeTarget(target);
      },
      instruction: readInstruction,
      writeInstruction: instruction.setInstruction,
      options: readOptions,
      writeOptions: promptOptions.setOptions,
      status: () => craftUse(status()),
      error: () => craftUse(error()),
      busy: () => craftUse(busy()),
      panelOffset: () => craftUse(panelOffset()),
      startDrag,
      resetPanelOffset,
      toggleRecord,
      clearTimeline,
      copyPrompt,
      exportJson,
      endpoint: configuredEndpoint,
      sendPayload,
      retrySend,
      copyPayload,
    };
  },
  ({
    onClose,
    visibleEvents,
    eventCount,
    targets,
    recording,
    removeTarget,
    instruction,
    writeInstruction,
    options,
    writeOptions,
    status,
    error,
    busy,
    panelOffset,
    startDrag,
    resetPanelOffset,
    toggleRecord,
    clearTimeline,
    copyPrompt,
    exportJson,
    endpoint,
    sendPayload,
    retrySend,
    copyPayload,
  }: ChatContext) =>
    div({ class: 'craft-ai-chat-overlay' }, [
      div(
        {
          class: 'craft-ai-chat',
          role: 'dialog',
          'aria-label': 'Send context to AI',
          contextmenu: (event: MouseEvent) => event.stopPropagation(),
          style: () => {
            const offset = panelOffset();
            return offset.x === 0 && offset.y === 0
              ? null
              : { transform: `translate(${offset.x}px, ${offset.y}px)` };
          },
        },
        [
          header(
            {
              class: 'craft-ai-chat-header',
              // Drag the panel out of the way to reach what it covers.
              title: 'Drag to move · double-click to reset',
              pointerdown: startDrag,
              dblclick: resetPanelOffset,
            },
            [
              strong({ class: 'craft-ai-title' }, '✨ Send context to AI'),
              button(
                'aiChatClose',
                {
                  type: 'button',
                  class: 'craft-ai-chat-close',
                  'aria-label': 'Close',
                  click: () => onClose(),
                },
                '×',
              ),
            ],
          ),

          section({ class: 'craft-ai-section' }, [
            div({ class: 'craft-ai-section-head' }, [
              span(() => `Selected elements (${targets().length})`),
            ]),
            ol(
              { class: 'craft-ai-targets', 'aria-label': 'Selected elements' },
              forNode(
                () => targets(),
                {
                  track: (target: SendContextTargetRow) => target.key,
                  empty: () =>
                    p(
                      { class: 'craft-ai-empty' },
                      'Right-click a component to capture it.',
                    ),
                },
                (target) =>
                  li({ class: 'craft-ai-target' }, [
                    span(
                      {
                        class: 'craft-ai-target-label',
                        title: function* () {
                          return (yield* target()).label;
                        },
                      },
                      function* () {
                        return (yield* target()).label;
                      },
                    ),
                    button(
                      'aiRemoveTarget',
                      {
                        type: 'button',
                        class: 'craft-ai-target-remove',
                        'aria-label': 'Remove this element',
                        click: () => removeTarget(craftUse(target()).index),
                      },
                      '×',
                    ),
                  ]),
              ),
            ),
          ]),

          section({ class: 'craft-ai-section' }, [
            div({ class: 'craft-ai-section-head' }, [
              span(() => `Timeline (${eventCount()})`),
              span({ class: 'craft-ai-chat-actions' }, [
                button(
                  'aiToggleRecord',
                  {
                    type: 'button',
                    class: () => (recording() ? 'recording' : ''),
                    'aria-pressed': () => recording(),
                    click: toggleRecord,
                  },
                  () => (recording() ? '■ Stop' : '● Record'),
                ),
                button(
                  'aiClearTimeline',
                  { type: 'button', click: clearTimeline },
                  'Clear',
                ),
              ]),
            ]),
            ol(
              { class: 'craft-ai-timeline', 'aria-label': 'Recorded events' },
              forNode(
                () => visibleEvents(),
                {
                  track: (event: SendContextTimelineRow) => event.id,
                  empty: () =>
                    p(
                      { class: 'craft-ai-empty' },
                      'No event recorded yet — interact with the app.',
                    ),
                },
                (event) =>
                  li(
                    {
                      title: function* () {
                        return (yield* event()).title;
                      },
                    },
                    [
                      span({ class: 'craft-ai-event-time' }, function* () {
                        return (yield* event()).time;
                      }),
                      span(
                        {
                          class: function* () {
                            return `craft-ai-phase craft-ai-phase--${(yield* event()).phase}`;
                          },
                        },
                        function* () {
                          return (yield* event()).phase;
                        },
                      ),
                      span({ class: 'craft-ai-event-name' }, function* () {
                        return (yield* event()).label;
                      }),
                    ],
                  ),
              ),
            ),
          ]),

          section({ class: 'craft-ai-section' }, [
            label(
              {
                class: 'craft-ai-section-head',
                htmlFor: 'craft-ai-chat-instruction',
              },
              'Instruction',
            ),
            textarea('aiChatInstruction', {
              id: 'craft-ai-chat-instruction',
              class: 'craft-ai-textarea',
              rows: 4,
              value: instruction,
              placeholder: 'Describe what you want the AI to do…',
              *input(event) {
                yield* writeInstruction(
                  (event.target as HTMLTextAreaElement).value,
                );
              },
            }),
          ]),

          fieldset({ class: 'craft-ai-options' }, [
            legend('What to copy'),
            promptOption(
              'aiIncludeTargets',
              'Selected elements',
              options,
              writeOptions,
              'includeTargets',
            ),
            promptOption(
              'aiIncludeComponent',
              'Component information',
              options,
              writeOptions,
              'includeComponent',
            ),
            promptOption(
              'aiIncludeTimeline',
              'Timeline summary',
              options,
              writeOptions,
              'includeTimeline',
            ),
            promptOption(
              'aiIncludeTimelineJson',
              'Timeline JSON',
              options,
              writeOptions,
              'includeTimelineJson',
            ),
            promptOption(
              'aiIncludeAppSnapshot',
              'App snapshot',
              options,
              writeOptions,
              'includeAppSnapshot',
            ),
            promptOption(
              'aiIncludeDomStyles',
              'Component DOM + CSS',
              options,
              writeOptions,
              'includeDomStyles',
            ),
            promptOption(
              'aiIncludePageDomStyles',
              'Full page DOM + CSS',
              options,
              writeOptions,
              'includePageDomStyles',
            ),
          ]),

          // Toggled by style rather than `ifNode`, which needs a *named* craft
          // value and would leak internal symbols into the exported type.
          div(
            {
              class: 'craft-ai-warning',
              style: () =>
                options().includeDomStyles || options().includePageDomStyles
                  ? null
                  : { display: 'none' },
            },
            'The DOM capture can take a moment, freeze the page and produce a very large prompt.',
          ),
          liveRegion(
            { politeness: 'polite' },
            div(
              {
                class: 'craft-ai-success',
                style: () => (status() ? null : { display: 'none' }),
              },
              status,
            ),
          ),
          liveRegion(
            { politeness: 'assertive' },
            div(
              {
                class: 'craft-ai-warning',
                style: () => (error() ? null : { display: 'none' }),
              },
              error,
            ),
          ),

          footer({ class: 'craft-ai-chat-actions' }, [
            button(
              'aiChatCancel',
              { type: 'button', click: () => onClose() },
              'Close',
            ),
            span({ class: 'spacer' }),
            button(
              'aiExportJson',
              { type: 'button', click: exportJson },
              'Copy JSON',
            ),
            ...(endpoint
              ? [
                  button(
                    'aiCopyWebhookPrompt',
                    {
                      type: 'button',
                      disabled: busy,
                      click: copyPrompt,
                    },
                    'Copy prompt',
                  ),
                  button(
                    'aiRetrySend',
                    {
                      type: 'button',
                      style: () => (error() ? null : { display: 'none' }),
                      disabled: busy,
                      click: retrySend,
                    },
                    'Retry',
                  ),
                  button(
                    'aiCopyPayload',
                    {
                      type: 'button',
                      style: () => (error() ? null : { display: 'none' }),
                      disabled: busy,
                      click: copyPayload,
                    },
                    'Copy payload',
                  ),
                  button(
                    'aiSendContext',
                    {
                      type: 'button',
                      class: 'primary',
                      disabled: busy,
                      click: sendPayload,
                    },
                    () => (busy() ? 'Sending…' : 'Send'),
                  ),
                ]
              : [
                  button(
                    'aiCopyPrompt',
                    {
                      type: 'button',
                      class: 'primary',
                      disabled: busy,
                      click: copyPrompt,
                    },
                    () => (busy() ? 'Preparing…' : '⧉ Copy prompt'),
                  ),
                ]),
          ] as never),
        ],
      ),
    ]),
);

function toTimelineRow(event: SendContextEvent): SendContextTimelineRow {
  return {
    id: event.id,
    time: new Date(event.timestamp).toISOString().slice(11, 23),
    phase: event.phase,
    label: event.name ? `${event.kind} · ${event.name}` : String(event.kind),
    title: formatEventLine(event),
  };
}

/** One checkbox of the "What to copy" fieldset. */
function promptOption(
  name: string,
  text: string,
  options: () => SendContextPromptOptions,
  writeOptions: (
    value: SendContextPromptOptions,
  ) => Generator<unknown, unknown, unknown>,
  key: keyof SendContextPromptOptions,
) {
  return label({ class: 'craft-ai-option' }, [
    input(name, {
      type: 'checkbox',
      checked: () => options()[key],
      *change(event) {
        yield* writeOptions({
          ...options(),
          [key]: (event.target as HTMLInputElement).checked,
        });
      },
    }),
    span(text),
  ]);
}
