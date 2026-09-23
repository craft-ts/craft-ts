import {
  CraftTemporalRuntime,
  craftMethod,
  craftUse,
  fromEventToSource$,
  state,
  type CraftTemporalRuntime as CraftTemporalRuntimeApi,
  type TemporalTaskHandle,
  type SendContextPayload,
} from '@craft-ts/core';
import { liveRegion } from '../a11y';
import { craftComponent } from '../component';
import {
  button,
  dialog,
  div,
  fieldset,
  footer,
  header,
  input,
  label,
  legend,
  section,
  span,
  strong,
  textarea,
} from '../hyperscript';
import type { CraftComponent, Input, Output } from '../types';
import { captureAiDomStyles } from './ai-dom-capture';
import { aiTheme } from './ai-overlay.style';
import { aiDialog } from './ai-send-dialog.style';

type AiDialogPayload = SendContextPayload & {
  readonly captureElement?: Element;
};

type PromptOptions = {
  readonly includeClickedElement: boolean;
  readonly includeComponent: boolean;
  readonly includeAppSnapshot: boolean;
  readonly includeDomStyles: boolean;
  readonly includePageDomStyles: boolean;
};

const DEFAULT_PROMPT_OPTIONS: PromptOptions = {
  includeClickedElement: true,
  includeComponent: true,
  includeAppSnapshot: true,
  includeDomStyles: false,
  includePageDomStyles: false,
};

type AiDialogContext = {
  payload: Input<AiDialogPayload>;
  onClose: () => void;
  instruction: () => string;
  writeInstruction: (value: string) => Generator<unknown, unknown, unknown>;
  copied: () => boolean;
  options: () => PromptOptions;
  writeOptions: (value: PromptOptions) => Generator<unknown, unknown, unknown>;
  captureInProgress: () => boolean;
  captureError: () => string;
  copy: () => void;
};

type AiDialogFactoryContext = Omit<AiDialogContext, 'onClose'> & {
  onClose: Output<() => void>;
};

function formatPrompt(
  payload: AiDialogPayload & { instruction: string },
  options: PromptOptions,
  captures: {
    readonly component?: unknown;
    readonly page?: unknown;
  },
): string {
  const clickedElement = payload.clickedElement ?? {
    tagName: 'unknown',
    textContent: '',
    outerHTML: payload.outerHTML,
  };
  const sections = [`# Instruction`, payload.instruction, ``];

  if (options.includeComponent) {
    sections.push(
      `# Component information`,
      `- hostName: ${payload.hostName}`,
      `- tagList: ${JSON.stringify(payload.tagList)}`,
      `- coords: (${payload.coords.x}, ${payload.coords.y})`,
      ``,
      `# Component host outerHTML (truncated)`,
      '```html',
      payload.outerHTML,
      '```',
      ``,
    );
  }

  if (options.includeClickedElement) {
    sections.push(
      `# Clicked element`,
      `- tagName: ${clickedElement.tagName}`,
      `- textContent: ${JSON.stringify(clickedElement.textContent)}`,
      `# Clicked element outerHTML (truncated)`,
      '```html',
      clickedElement.outerHTML,
      '```',
      ``,
    );
  }

  if (options.includeDomStyles && captures.component !== undefined) {
    sections.push(
      `# Component DOM + computed CSS styles`,
      '```json',
      JSON.stringify(captures.component, null, 2),
      '```',
      ``,
    );
  }

  if (options.includePageDomStyles && captures.page !== undefined) {
    sections.push(
      `# Full page DOM + computed CSS styles`,
      '```json',
      JSON.stringify(captures.page, null, 2),
      '```',
      ``,
    );
  }

  if (options.includeAppSnapshot) {
    const snapshotJson = (() => {
      try {
        return JSON.stringify(payload.snapshot, null, 2);
      } catch {
        return '[unserializable snapshot]';
      }
    })();
    sections.push(
      `# App snapshot (${payload.snapshot.length} reports)`,
      '```json',
      snapshotJson,
      '```',
    );
  }

  return sections.join('\n');
}

/**
 * Modal that collects an instruction and copies the formatted prompt, with the
 * captured component context and app snapshot, to the clipboard.
 */
export const AiSendDialog: CraftComponent<{
  payload: Input<AiDialogPayload>;
  onClose: Output<() => void>;
}> = craftComponent(
  'AiSendDialog',
  {
  },
  function* (
    payload: Input<AiDialogPayload>,
    onClose: Output<() => void>,
  ): Generator<unknown, AiDialogFactoryContext, unknown> {
    const temporalRuntime = yield* CraftTemporalRuntime();
    type InstructionState = (() => string) & {
      setInstruction: (value: string) => Generator<unknown, unknown, unknown>;
    };
    type CopiedState = (() => boolean) & {
      setCopied: (value: boolean) => Generator<unknown, unknown, unknown>;
    };
    type PromptOptionsState = (() => PromptOptions) & {
      setPromptOptions: (
        value: PromptOptions,
      ) => Generator<unknown, unknown, unknown>;
    };
    type CaptureState = (() => boolean) & {
      setCaptureInProgress: (
        value: boolean,
      ) => Generator<unknown, unknown, unknown>;
    };
    type ErrorState = (() => string) & {
      setCaptureError: (value: string) => Generator<unknown, unknown, unknown>;
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
    const promptOptions = yield* state(
      'promptOptions',
      DEFAULT_PROMPT_OPTIONS,
      ({ set }) => ({
        setPromptOptions: (value: PromptOptions) => set(value),
      }),
    ) as unknown as Generator<never, PromptOptionsState, unknown>;
    const captureInProgress = yield* state(
      'captureInProgress',
      false,
      ({ set }) => ({
        setCaptureInProgress: (value: boolean) => set(value),
      }),
    ) as unknown as Generator<never, CaptureState, unknown>;
    const captureError = yield* state('captureError', '', ({ set }) => ({
      setCaptureError: (value: string) => set(value),
    })) as unknown as Generator<never, ErrorState, unknown>;

    const setCopied: (value: boolean) => void = craftMethod(
      'setCopied',
      function* (value: boolean) {
        yield* copied.setCopied(value);
      },
    );
    const setCaptureInProgress: (value: boolean) => void = craftMethod(
      'setCaptureInProgress',
      function* (value: boolean) {
        yield* captureInProgress.setCaptureInProgress(value);
      },
    );
    const setCaptureError: (value: string) => void = craftMethod(
      'setCaptureError',
      function* (value: string) {
        yield* captureError.setCaptureError(value);
      },
    );

    let copiedTimer: TemporalTaskHandle | null = null;

    const readInstruction = (): string => craftUse(instruction());
    const readCopied = (): boolean => craftUse(copied());
    const readPromptOptions = (): PromptOptions => craftUse(promptOptions());
    const readCaptureInProgress = (): boolean =>
      craftUse(captureInProgress());
    const readCaptureError = (): string => craftUse(captureError());

    fromEventToSource$<KeyboardEvent>(document, 'keydown').subscribe(
      (event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      },
    );

    const copy = () => {
      const text = readInstruction().trim();
      if (!text || readCaptureInProgress()) return;

      const options = readPromptOptions();
      setCopied(false);
      setCaptureError('');
      setCaptureInProgress(true);
      setTimeout(() => {
        try {
          const currentPayload = craftUse(payload());
          const componentCapture = options.includeDomStyles
            ? currentPayload.captureElement === undefined
              ? undefined
              : captureAiDomStyles(currentPayload.captureElement)
            : undefined;
          const pageCapture = options.includePageDomStyles
            ? captureAiDomStyles(document.documentElement, {
                maxBytes: 1024 * 1024,
                maxNodes: 10000,
              })
            : undefined;
          const content = formatPrompt(
            { ...currentPayload, instruction: text },
            options,
            { component: componentCapture, page: pageCapture },
          );
          void navigator.clipboard
            .writeText(content)
            .then(() => {
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
            })
            .catch(() => {
              setCaptureError('Impossible de copier le prompt.');
            })
            .finally(() => {
              setCaptureInProgress(false);
            });
        } catch (error) {
          setCaptureError(
            error instanceof Error
              ? error.message
              : 'Impossible de préparer le prompt.',
          );
          setCaptureInProgress(false);
        }
      }, 0);
    };

    return {
      payload,
      onClose,
      instruction: readInstruction,
      writeInstruction: instruction.setInstruction,
      copied: readCopied,
      options: readPromptOptions,
      writeOptions: promptOptions.setPromptOptions,
      captureInProgress: readCaptureInProgress,
      captureError: readCaptureError,
      copy,
    };
  },
  ({
    payload,
    onClose,
    instruction,
    writeInstruction,
    copied,
    options,
    writeOptions,
    captureInProgress,
    captureError,
    copy,
  }: AiDialogContext) =>
    dialog(
      {
        class: [aiTheme.root, aiDialog.overlay],
        open: true,
        labelledBy: 'craft-ai-dialog-title',
        onClose: () => onClose(),
      },
      div(
        {
          class: aiDialog.card,
        },
        [
          header({ class: aiDialog.header }, [
            strong({ id: 'craft-ai-dialog-title' }, 'Send context to AI'),
            button(
              'aiDialogClose',
              {
                type: 'button',
                class: aiDialog.close,
                'aria-label': 'Close',
                click: () => onClose(),
              },
              '×',
            ),
          ]),

          section({ class: aiDialog.context }, [
            div([
              span({ class: aiDialog.contextLabel }, 'Component:'),
              function* () {
                return (yield* payload()).hostName;
              },
            ]),
            div([
              span({ class: aiDialog.contextLabel }, 'Coords:'),
              function* () {
                const value = yield* payload();
                return `(${value.coords.x}, ${value.coords.y})`;
              },
            ]),
            div([
              span({ class: aiDialog.contextLabel }, 'Snapshot:'),
              function* () {
                return `${(yield* payload()).snapshot.length} report(s)`;
              },
            ]),
          ]),

          fieldset({ class: aiDialog.options }, [
            legend({ class: aiDialog.legend }, 'Contenu à copier'),
            label({ class: aiDialog.option }, [
              input('aiIncludeClickedElement', {
                type: 'checkbox',
                class: aiDialog.checkbox,
                checked: () => options().includeClickedElement,
                *change(event) {
                  yield* writeOptions({
                    ...options(),
                    includeClickedElement: (
                      event.target as HTMLInputElement
                    ).checked,
                  });
                },
              }),
              span('Élément ciblé'),
            ]),
            label({ class: aiDialog.option }, [
              input('aiIncludeComponent', {
                type: 'checkbox',
                class: aiDialog.checkbox,
                checked: () => options().includeComponent,
                *change(event) {
                  yield* writeOptions({
                    ...options(),
                    includeComponent: (event.target as HTMLInputElement)
                      .checked,
                  });
                },
              }),
              span('Informations du composant'),
            ]),
            label({ class: aiDialog.option }, [
              input('aiIncludeAppSnapshot', {
                type: 'checkbox',
                class: aiDialog.checkbox,
                checked: () => options().includeAppSnapshot,
                *change(event) {
                  yield* writeOptions({
                    ...options(),
                    includeAppSnapshot: (event.target as HTMLInputElement)
                      .checked,
                  });
                },
              }),
              span('État de l’application'),
            ]),
            label({ class: aiDialog.option }, [
              input('aiIncludeDomStyles', {
                type: 'checkbox',
                class: aiDialog.checkbox,
                checked: () => options().includeDomStyles,
                *change(event) {
                  yield* writeOptions({
                    ...options(),
                    includeDomStyles: (event.target as HTMLInputElement)
                      .checked,
                  });
                },
              }),
              span('DOM du composant et styles CSS calculés'),
            ]),
            label({ class: aiDialog.option }, [
              input('aiIncludePageDomStyles', {
                type: 'checkbox',
                class: aiDialog.checkbox,
                checked: () => options().includePageDomStyles,
                *change(event) {
                  yield* writeOptions({
                    ...options(),
                    includePageDomStyles: (event.target as HTMLInputElement)
                      .checked,
                  });
                },
              }),
              span('DOM complet de la page et styles CSS calculés'),
            ]),
            div(
              {
                class: aiDialog.warning,
                hidden: () =>
                  !(options().includeDomStyles || options().includePageDomStyles),
              },
              'La capture DOM peut prendre quelques instants, bloquer l’interface et produire une payload volumineuse.',
            ),
          ]),

          label(
            { class: aiDialog.label, htmlFor: 'craft-ai-instruction' },
            'Instruction',
          ),
          textarea('aiDialogInstruction', {
            id: 'craft-ai-instruction',
            class: aiDialog.textarea,
            rows: 6,
            value: instruction,
            placeholder: 'Describe what you want the AI to do…',
            *input(event) {
              yield* writeInstruction(
                (event.target as HTMLTextAreaElement).value,
              );
            },
          }),

          // Toggled by `hidden` rather than `ifNode`, which needs a *named*
          // craft value and would leak the same internal symbols into the type.
          liveRegion(
            { politeness: 'polite' },
            div(
              {
                class: aiDialog.success,
                hidden: () => !copied(),
              },
              'Copié dans le presse-papier ✓',
            ),
          ),
          liveRegion(
            { politeness: 'assertive' },
            div(
              {
                class: aiDialog.warning,
                hidden: () => !captureError(),
              },
              captureError,
            ),
          ),

          footer({ class: aiDialog.footer }, [
            button(
              'aiDialogCancel',
              {
                type: 'button',
                class: aiDialog.cancel,
                click: () => onClose(),
              },
              'Fermer',
            ),
            button(
              'aiDialogCopy',
              {
                type: 'button',
                class: aiDialog.copy,
                'data-craftAiCopy': () => (copied() ? 'done' : null),
                disabled: () =>
                  !instruction().trim() || captureInProgress(),
                click: copy,
              },
              () =>
                captureInProgress()
                  ? 'Préparation…'
                  : copied()
                    ? '✓ Copié'
                    : '⧉ Copier',
            ),
          ]),
        ],
      ),
    ),

);
