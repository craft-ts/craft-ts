import {
  CRAFT_TEMPORAL_RUNTIME,
  craftMethod,
  craftUse,
  fromEventToSource$,
  state,
  type CraftTemporalRuntime as CraftTemporalRuntimeApi,
  type TemporalTaskHandle,
  type SendContextPayload,
} from '@craft-ts/core';
import { ɵtoCraftService as toCraftService } from '@craft-ts/core';
import { liveRegion } from '../a11y';
import { craftComponent } from '../component';
import {
  button,
  dialog,
  div,
  footer,
  header,
  label,
  section,
  span,
  strong,
  textarea,
} from '../hyperscript';
import type { Input, Output } from '../types';

const { CraftTemporalRuntime } = toCraftService({
  name: 'CraftTemporalRuntime',
  scope: 'global',
  token: CRAFT_TEMPORAL_RUNTIME,
}) as unknown as {
  CraftTemporalRuntime: () => Generator<
    never,
    CraftTemporalRuntimeApi,
    unknown
  >;
};

function formatPrompt(
  payload: SendContextPayload & { instruction: string },
): string {
  const snapshotJson = (() => {
    try {
      return JSON.stringify(payload.snapshot, null, 2);
    } catch {
      return '[unserializable snapshot]';
    }
  })();
  return [
    `# Instruction`,
    payload.instruction,
    ``,
    `# Component clicked`,
    `- hostName: ${payload.hostName}`,
    `- tagList: ${JSON.stringify(payload.tagList)}`,
    `- coords: (${payload.coords.x}, ${payload.coords.y})`,
    ``,
    `# Element outerHTML (truncated)`,
    '```html',
    payload.outerHTML,
    '```',
    ``,
    `# App snapshot (${payload.snapshot.length} reports)`,
    '```json',
    snapshotJson,
    '```',
  ].join('\n');
}

/**
 * Modal that collects an instruction and copies the formatted prompt, with the
 * captured component context and app snapshot, to the clipboard.
 */
export const AiSendDialog = craftComponent(
  'AiSendDialog',
  {
    styles: `
      .craft-ai-overlay {
        position: fixed;
        inset: unset;
        border: none;
        background: transparent;
        padding: 24px;
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        font-size: 13px;
        color: #111827;
      }
      .craft-ai-overlay::backdrop {
        background: rgba(15, 23, 42, 0.5);
      }
      .craft-ai-card {
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
        width: min(560px, 100%);
        max-height: 90vh;
        overflow: auto;
        padding: 16px 20px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .craft-ai-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 14px;
      }
      .craft-ai-close {
        background: transparent;
        border: none;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        color: #6b7280;
      }
      .craft-ai-context {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 8px 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        display: grid;
        gap: 4px;
      }
      .craft-ai-context .label {
        color: #6b7280;
        margin-right: 4px;
      }
      .craft-ai-label {
        font-weight: 600;
      }
      .craft-ai-textarea {
        width: 100%;
        box-sizing: border-box;
        font-family: inherit;
        font-size: 13px;
        padding: 8px 10px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        resize: vertical;
        min-height: 96px;
      }
      .craft-ai-textarea:focus {
        outline: 2px solid #3b82f6;
        outline-offset: -1px;
      }
      .craft-ai-success {
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #065f46;
        padding: 8px 10px;
        border-radius: 6px;
      }
      .craft-ai-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .craft-ai-cancel {
        background: #ffffff;
        border: 1px solid #d1d5db;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
      }
      .craft-ai-copy {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #2563eb;
        color: #ffffff;
        border: none;
        padding: 6px 14px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: background 0.15s;
      }
      @media (prefers-reduced-motion: reduce) {
        .craft-ai-copy {
          transition: none;
        }
      }
      .craft-ai-copy--done {
        background: #059669;
      }
      .craft-ai-copy:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `,
  },
  function* (payload: Input<SendContextPayload>, onClose: Output<() => void>) {
    const temporalRuntime = yield* CraftTemporalRuntime();
    type InstructionState = (() => string) & {
      setInstruction: (value: string) => Generator<unknown, unknown, unknown>;
    };
    type CopiedState = (() => boolean) & {
      setCopied: (value: boolean) => Generator<unknown, unknown, unknown>;
    };

    // This component ships in a published package, so its inferred type goes
    // through declaration emit. Reactive values (craft `state()`, Angular
    // signals) carry `unique symbol`s that the emitter cannot name (TS4023),
    // so the signals stay local and the context exposes plain accessors only.
    const instruction = yield* state('instruction', '', ({ set }) => ({
      setInstruction: (value: string) => set(value),
    })) as unknown as Generator<never, InstructionState, unknown>;
    const copied = yield* state('copied', false, ({ set }) => ({
      setCopied: (value: boolean) => set(value),
    })) as unknown as Generator<never, CopiedState, unknown>;

    const setInstruction: (value: string) => void = craftMethod(
      'setInstruction',
      function* (value: string) {
        yield* instruction.setInstruction(value);
      },
    );
    const setCopied: (value: boolean) => void = craftMethod(
      'setCopied',
      function* (value: boolean) {
        yield* copied.setCopied(value);
      },
    );

    let copiedTimer: TemporalTaskHandle | null = null;

    fromEventToSource$<KeyboardEvent>(document, 'keydown').subscribe(
      (event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      },
    );

    const copy = () => {
      const text = instruction().trim();
      if (!text) return;

      const content = formatPrompt({
        ...craftUse(payload()),
        instruction: text,
      });
      void navigator.clipboard.writeText(content).then(() => {
        setCopied(true);
        copiedTimer?.cancel();
        copiedTimer = temporalRuntime.schedule(
          () => {
            setCopied(false);
          },
          2500,
          {
            kind: 'ai-copy-feedback',
            owner: 'ai-send-dialog',
          },
        );
      });
    };

    return {
      payload,
      onClose,
      instruction: (): string => instruction(),
      writeInstruction: (value: string): void => {
        setInstruction(value);
      },
      copied: (): boolean => copied(),
      copy,
    };
  },
  ({ payload, onClose, instruction, writeInstruction, copied, copy }) =>
    dialog(
      {
        class: 'craft-ai-overlay',
        open: true,
        labelledBy: 'craft-ai-dialog-title',
        onClose: () => onClose(),
      },
      div(
        {
          class: 'craft-ai-card',
        },
        [
          header({ class: 'craft-ai-header' }, [
            strong({ id: 'craft-ai-dialog-title' }, 'Send context to AI'),
            button(
              'aiDialogClose',
              {
                type: 'button',
                class: 'craft-ai-close',
                'aria-label': 'Close',
                click: () => onClose(),
              },
              '×',
            ),
          ]),

          section({ class: 'craft-ai-context' }, [
            div([
              span({ class: 'label' }, 'Component:'),
              function* () {
                return (yield* payload()).hostName;
              },
            ]),
            div([
              span({ class: 'label' }, 'Coords:'),
              function* () {
                const value = yield* payload();
                return `(${value.coords.x}, ${value.coords.y})`;
              },
            ]),
            div([
              span({ class: 'label' }, 'Snapshot:'),
              function* () {
                return `${(yield* payload()).snapshot.length} report(s)`;
              },
            ]),
          ]),

          label(
            { class: 'craft-ai-label', htmlFor: 'craft-ai-instruction' },
            'Instruction',
          ),
          textarea('aiDialogInstruction', {
            id: 'craft-ai-instruction',
            class: 'craft-ai-textarea',
            rows: 6,
            value: instruction,
            placeholder: 'Describe what you want the AI to do…',
            input: (event: Event) =>
              writeInstruction((event.target as HTMLTextAreaElement).value),
          }),

          // Toggled by style rather than `ifBlock`, which needs a *named* craft
          // value and would leak the same internal symbols into the type.
          liveRegion(
            { politeness: 'polite' },
            div(
              {
                class: 'craft-ai-success',
                style: () => (copied() ? null : { display: 'none' }),
              },
              'Copié dans le presse-papier ✓',
            ),
          ),

          footer({ class: 'craft-ai-footer' }, [
            button(
              'aiDialogCancel',
              {
                type: 'button',
                class: 'craft-ai-cancel',
                click: () => onClose(),
              },
              'Fermer',
            ),
            button(
              'aiDialogCopy',
              {
                type: 'button',
                class: () => [
                  'craft-ai-copy',
                  copied() && 'craft-ai-copy--done',
                ],
                disabled: () => !instruction().trim(),
                click: copy,
              },
              () => (copied() ? '✓ Copié' : '⧉ Copier'),
            ),
          ]),
        ],
      ),
    ),
);
