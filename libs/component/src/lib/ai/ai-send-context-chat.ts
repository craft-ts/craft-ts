import {
  CraftTemporalRuntime,
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
import { measureAi, writeAiClipboard } from './ai-performance';
import { assign, unit } from '@craft-ts/style';
import { aiTheme } from './ai-overlay.style';
import { aiChat, chatOffset } from './ai-send-context-chat.style';
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
  {},
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
      if (target.closest('[data-ai-chat]')) return;
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
      const panel = handle.closest<HTMLElement>('[data-ai-chat]');
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
      void writeAiClipboard(text)
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
        ? captureAiDomStyles(document.documentElement)
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
            measureAi('prompt.build', preparePayload).prompt,
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
    div({ class: [aiTheme.root, aiChat.overlay] }, [
      div(
        {
          class: aiChat.panel,
          // A behaviour hook, not a style: outside-press and drag find the
          // panel by it, whatever its classes are.
          'data-ai-chat': '',
          role: 'dialog',
          'aria-label': 'Send context to AI',
          contextmenu: (event: MouseEvent) => event.stopPropagation(),
          // Where the panel was dragged: typed variables, read by the sheet.
          style: () => {
            const offset = panelOffset();
            return {
              ...assign(chatOffset.x, unit.px(offset.x)),
              ...assign(chatOffset.y, unit.px(offset.y)),
            };
          },
        },
        [
          header(
            {
              class: aiChat.header,
              // Drag the panel out of the way to reach what it covers.
              title: 'Drag to move · double-click to reset',
              pointerdown: startDrag,
              dblclick: resetPanelOffset,
            },
            [
              strong({ class: aiChat.title }, '✨ Send context to AI'),
              button(
                'aiChatClose',
                {
                  type: 'button',
                  class: aiChat.close,
                  'aria-label': 'Close',
                  click: () => onClose(),
                },
                '×',
              ),
            ],
          ),

          section({ class: aiChat.section }, [
            div({ class: aiChat.sectionHead }, [
              span(() => `Selected elements (${targets().length})`),
            ]),
            ol(
              { class: aiChat.targets, 'aria-label': 'Selected elements' },
              forNode(
                () => targets(),
                {
                  track: (target: SendContextTargetRow) => target.key,
                  empty: () =>
                    p(
                      { class: aiChat.empty },
                      'Right-click a component to capture it.',
                    ),
                },
                (target) =>
                  li({ class: aiChat.target }, [
                    span(
                      {
                        class: aiChat.targetLabel,
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
                        class: aiChat.targetRemove,
                        'aria-label': 'Remove this element',
                        click: () => removeTarget(craftUse(target()).index),
                      },
                      '×',
                    ),
                  ]),
              ),
            ),
          ]),

          section({ class: aiChat.section }, [
            div({ class: aiChat.sectionHead }, [
              span(() => `Timeline (${eventCount()})`),
              span({ class: aiChat.actions }, [
                button(
                  'aiToggleRecord',
                  {
                    type: 'button',
                    class: aiChat.button,
                    'data-craftAiButton': () =>
                      recording() ? 'recording' : null,
                    'aria-pressed': () => recording(),
                    click: toggleRecord,
                  },
                  () => (recording() ? '■ Stop' : '● Record'),
                ),
                button(
                  'aiClearTimeline',
                  {
                    type: 'button',
                    class: aiChat.button,
                    click: clearTimeline,
                  },
                  'Clear',
                ),
              ]),
            ]),
            ol(
              { class: aiChat.timeline, 'aria-label': 'Recorded events' },
              forNode(
                () => visibleEvents(),
                {
                  track: (event: SendContextTimelineRow) => event.id,
                  empty: () =>
                    p(
                      { class: aiChat.empty },
                      'No event recorded yet — interact with the app.',
                    ),
                },
                (event) =>
                  li(
                    {
                      class: aiChat.event,
                      title: function* () {
                        return (yield* event()).title;
                      },
                    },
                    [
                      span({ class: aiChat.eventTime }, function* () {
                        return (yield* event()).time;
                      }),
                      span(
                        {
                          class: aiChat.phase,
                          'data-craftAiPhase': function* () {
                            return (yield* event()).phase;
                          },
                        },
                        function* () {
                          return (yield* event()).phase;
                        },
                      ),
                      span({ class: aiChat.eventName }, function* () {
                        return (yield* event()).label;
                      }),
                    ],
                  ),
              ),
            ),
          ]),

          section({ class: aiChat.section }, [
            label(
              {
                class: aiChat.sectionHead,
                htmlFor: 'craft-ai-chat-instruction',
              },
              'Instruction',
            ),
            textarea('aiChatInstruction', {
              id: 'craft-ai-chat-instruction',
              class: aiChat.textarea,
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

          fieldset({ class: aiChat.options }, [
            legend({ class: aiChat.legend }, 'What to copy'),
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

          // Toggled by `hidden` rather than `ifNode`, which needs a *named*
          // craft value and would leak internal symbols into the exported type.
          div(
            {
              class: aiChat.warning,
              hidden: () =>
                !(options().includeDomStyles || options().includePageDomStyles),
            },
            'The DOM capture can take a moment, freeze the page and produce a very large prompt.',
          ),
          liveRegion(
            { politeness: 'polite' },
            div(
              {
                class: aiChat.success,
                hidden: () => !status(),
              },
              status,
            ),
          ),
          liveRegion(
            { politeness: 'assertive' },
            div(
              {
                class: aiChat.warning,
                hidden: () => !error(),
              },
              error,
            ),
          ),

          footer({ class: aiChat.actions }, [
            button(
              'aiChatCancel',
              { type: 'button', class: aiChat.button, click: () => onClose() },
              'Close',
            ),
            span({ class: aiChat.spacer }),
            button(
              'aiExportJson',
              { type: 'button', class: aiChat.button, click: exportJson },
              'Copy JSON',
            ),
            ...(endpoint
              ? [
                  button(
                    'aiCopyWebhookPrompt',
                    {
                      type: 'button',
                      class: aiChat.button,
                      disabled: busy,
                      click: copyPrompt,
                    },
                    'Copy prompt',
                  ),
                  button(
                    'aiRetrySend',
                    {
                      type: 'button',
                      class: aiChat.button,
                      hidden: () => !error(),
                      disabled: busy,
                      click: retrySend,
                    },
                    'Retry',
                  ),
                  button(
                    'aiCopyPayload',
                    {
                      type: 'button',
                      class: aiChat.button,
                      hidden: () => !error(),
                      disabled: busy,
                      click: copyPayload,
                    },
                    'Copy payload',
                  ),
                  button(
                    'aiSendContext',
                    {
                      type: 'button',
                      class: aiChat.button,
                      'data-craftAiButton': 'primary',
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
                      class: aiChat.button,
                      'data-craftAiButton': 'primary',
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
  return label({ class: aiChat.option }, [
    input(name, {
      type: 'checkbox',
      class: aiChat.checkbox,
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
