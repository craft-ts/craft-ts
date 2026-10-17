import {
  button,
  craftComponent,
  div,
  forNode,
  liveRegion,
  span,
  type Input,
  type Output,
} from '@craft-ts/component';
import { craftExpose, craftService, state } from '@craft-ts/core';
import { toneIcon, type CalloutTone } from '../callout/callout.ts';
import { DocIcon } from '../icon/icon.ts';
import { TOAST_MS, toastUi } from './toast.style.ts';

export type ToastTone = CalloutTone;

export interface ToastMessage {
  readonly id: number;
  readonly tone: ToastTone;
  readonly text: string;
}

/**
 * The queue of toasts on screen. Whoever shows one asks the queue; the region
 * only draws what the queue holds. A toast leaves by itself after `TOAST_MS`,
 * and sooner when its close button is pressed.
 */
export const { DocToastQueue, provideDocToastQueue } = craftService(
  { name: 'docToastQueue', providedIn: 'toProvide' },
  function* () {
    let nextId = 1;
    const toasts = yield* state(
      'toasts',
      [] as readonly ToastMessage[],
      ({ update }) => {
        const dismiss = (id: number) =>
          update((list) => list.filter((toast) => toast.id !== id));
        return {
          dismiss,
          push: (tone: ToastTone, text: string) => {
            const id = nextId++;
            update((list) => [...list, { id, tone, text }]);
            setTimeout(() => dismiss(id), TOAST_MS);
          },
        };
      },
    );
    yield* craftExpose('push', toasts.push);
    yield* craftExpose('dismiss', toasts.dismiss);
  },
);

export interface ToastInput {
  readonly toastId: Input<number>;
  readonly tone: Input<ToastTone>;
  readonly message: Input<string>;
  readonly dismiss: Output<(id: number) => void>;
}

/** One message: the tone's glyph, the text, and a button to send it away. */
export const DocToast = craftComponent('DocToast', {}, (props: ToastInput) =>
  div({ class: toastUi.root, 'data-tone': props.tone }, [
    DocIcon({
      name: function* () {
        return toneIcon[yield* props.tone()];
      },
      size: function* () {
        return 'md' as const;
      },
    }),
    span({ class: toastUi.message }, props.message),
    button(
      'docToastClose',
      {
        type: 'button',
        class: toastUi.close,
        'aria-label': 'Dismiss notification',
        *click() {
          props.dismiss(yield* props.toastId());
        },
      },
      [
        DocIcon({
          name: function* () {
            return 'close' as const;
          },
          size: function* () {
            return 'md' as const;
          },
        }),
      ],
    ),
  ]),
);

/**
 * The corner of the screen where toasts appear. It is a polite live region, so
 * a screen reader announces each message without taking focus from what the
 * reader is doing. It reads the queue from the layout above it.
 */
export const DocToastRegion = craftComponent('DocToastRegion', {}, function* () {
  const queue = yield* DocToastQueue();
  return div(
    { class: toastUi.region, role: 'region', 'aria-label': 'Notifications' },
    [
      liveRegion([
        forNode(queue.toasts, { track: (toast) => toast.id }, (toast) =>
          DocToast({
            toastId: function* () {
              return (yield* toast()).id;
            },
            tone: function* () {
              return (yield* toast()).tone;
            },
            message: function* () {
              return (yield* toast()).text;
            },
            dismiss: queue.dismiss as never,
          }),
        ),
      ]),
    ],
  );
});
