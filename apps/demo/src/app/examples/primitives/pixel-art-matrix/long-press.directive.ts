import {
  craftDirective,
  type HostRequiredLogic,
  type HostTemplate,
  type Input,
  type YieldableTemplateContext,
} from '@craft-ng/component';
import { craftUse } from '@craft-ng/core';

type PressHandlers = {
  start: (event: PointerEvent) => void;
  end: () => void;
  click: (event: MouseEvent) => void;
};

type LongPressContext = {
  longPressDuration: Input<number>;
  onLongPress: Input<(event: PointerEvent) => void>;
  press: PressHandlers;
};

/**
 * Emits `onLongPress` when the host element is held down for
 * `longPressDuration` ms, and swallows the click that ends the press so the
 * host's own click handler does not fire on release.
 */
export const longPress = craftDirective(
  'longPress',
  {},
  (baseLogic: HostRequiredLogic<Record<never, never>>) =>
    (
      longPressDuration: Input<number>,
      onLongPress: Input<(event: PointerEvent) => void>,
    ) => {

      let timer: ReturnType<typeof setTimeout> | null = null;
      let suppressClickOnce = false;
      let longPressTriggered = false;

      const end = () => {
        if (timer === null) {
          return;
        }
        clearTimeout(timer);
        timer = null;
      };

      const press: PressHandlers = {
        start: (event) => {
          end();
          longPressTriggered = false;
          suppressClickOnce = false;

          timer = setTimeout(() => {
            longPressTriggered = true;
            suppressClickOnce = true;
            craftUse(onLongPress())(event);
          },
          craftUse(longPressDuration()),
        );
        },
        end,
        click: (event) => {
          if (!suppressClickOnce && !longPressTriggered) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();
          suppressClickOnce = false;
          longPressTriggered = false;
        },
      };

      return { ...baseLogic(), longPressDuration, onLongPress, press };
    },

  (baseTemplate: HostTemplate<LongPressContext>) =>
    (context: YieldableTemplateContext<LongPressContext>) =>
      baseTemplate(context, {
        pointerdown: context.press.start,
        pointerup: context.press.end,
        pointercancel: context.press.end,
        pointerleave: context.press.end,
        click: context.press.click,
      }),
);
