import {
  DestroyRef,
} from '@craft-ng/core';
import {
  CRAFT_TEMPORAL_RUNTIME,
  craftNodeDirective,
  executeYieldable,
  type TemporalTaskHandle,
} from '@craft-ng/core';

export const LONG_PRESS_DURATION_MS = 450;

type LongPressProps = {
  readonly longPressDuration: number;
  readonly onLongPress: (event: PointerEvent) => unknown;
};

/**
 * Emits `onLongPress` when the host element is held down for
 * `longPressDuration` ms, and swallows the click that ends the press so the
 * host's own click handler does not fire on release.
 */
export const longPress = craftNodeDirective<LongPressProps>(
  'longPress',
  ['longPressDuration', 'onLongPress'],
  (context) => {
    const temporalRuntime = context.injector.get(CRAFT_TEMPORAL_RUNTIME);
    const destroyRef = context.injector.get(DestroyRef);
    let timer: TemporalTaskHandle | null = null;
    let suppressClickOnce = false;
    let longPressTriggered = false;

    const cancelTimer = () => {
      timer?.cancel();
      timer = null;
    };

    const durationMs = () => {
      const value = context.props.longPressDuration;
      const resolved =
        typeof value === 'function'
          ? executeYieldable(value as () => number, [], context.injector)
          : value;
      return typeof resolved === 'number' ? resolved : LONG_PRESS_DURATION_MS;
    };

    const start = (event: Event) => {
      cancelTimer();
      longPressTriggered = false;
      suppressClickOnce = false;
      timer = temporalRuntime.schedule(
        () => {
          timer = null;
          longPressTriggered = true;
          suppressClickOnce = true;
          const handler = context.props.onLongPress;
          if (typeof handler === 'function') {
            executeYieldable(handler, [event as PointerEvent], context.injector);
          }
        },
        durationMs(),
        {
          kind: 'long-press',
          owner: 'longPress',
          destroyRef,
        },
      );
    };

    const suppressClick = (event: Event) => {
      if (!suppressClickOnce && !longPressTriggered) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickOnce = false;
      longPressTriggered = false;
    };

    const unlistenStart = context.renderer.listen(
      context.element,
      'pointerdown',
      start,
    );
    const unlistenEnd = context.renderer.listen(
      context.element,
      'pointerup',
      cancelTimer,
    );
    const unlistenCancel = context.renderer.listen(
      context.element,
      'pointercancel',
      cancelTimer,
    );
    const unlistenLeave = context.renderer.listen(
      context.element,
      'pointerleave',
      cancelTimer,
    );
    context.element.addEventListener('click', suppressClick, true);

    return () => {
      cancelTimer();
      unlistenStart();
      unlistenEnd();
      unlistenCancel();
      unlistenLeave();
      context.element.removeEventListener('click', suppressClick, true);
    };
  },
);
