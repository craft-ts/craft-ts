import {
  button,
  craftComponent,
  span,
  type Input,
} from '@craft-ts/component';
import { craftExpose, craftService, state } from '@craft-ts/core';
import { DocIcon } from '../icon/icon.ts';
import { codeUi } from './code.style.ts';

/** How long "Copied" stays up before the label goes back to "Copy". */
const CONFIRMATION_MS = 2000;

/** Whether the last copy just happened: the one flag a copy button owns. */
export const { DocCopyView, provideDocCopyView } = craftService(
  { name: 'docCopyView', providedIn: 'toProvide' },
  function* () {
    const copied = yield* state('copied', false, ({ update }) => ({
      flash: () => {
        update(() => true);
        setTimeout(() => update(() => false), CONFIRMATION_MS);
      },
    }));
    yield* craftExpose('flash', copied.flash);
  },
);

export interface CopyButtonInput {
  /** What lands on the clipboard. */
  readonly text: Input<string>;
}

/**
 * Copies a block of text and says so. The clipboard is a browser boundary: it
 * is reached from a click handler only, never while rendering, so a page
 * rendered on the server never touches it. When the API is missing (an
 * insecure origin) the button simply does nothing instead of failing loudly.
 */
export const DocCopyButton = craftComponent(
  'DocCopyButton',
  { providers: [provideDocCopyView()] },
  function* (input: CopyButtonInput) {
    const view = yield* DocCopyView();
    return button(
      'docCopyButton',
      {
        type: 'button',
        class: codeUi.copy,
        *click() {
          const text = yield* input.text();
          const clipboard =
            typeof navigator === 'undefined' ? undefined : navigator.clipboard;
          if (!clipboard) return;
          void clipboard.writeText(text).then(
            () => view.flash(),
            () => undefined,
          );
        },
      },
      [
        DocIcon({
          name: function* () {
            return (yield* view.copied()) ? ('check' as const) : ('copy' as const);
          },
          size: function* () {
            return 'sm' as const;
          },
        }),
        span({ 'aria-live': 'polite' }, function* () {
          return (yield* view.copied()) ? 'Copied' : 'Copy';
        }),
      ],
    );
  },
);
