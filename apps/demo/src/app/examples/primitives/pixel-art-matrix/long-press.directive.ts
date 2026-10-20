import { DestroyRef } from '@craft-ts/core';
import {
  CRAFT_TEMPORAL_RUNTIME,
  craftNodeDirective,
  executeYieldable,
  runCraftReplayTrigger,
  type TemporalTaskHandle,
} from '@craft-ts/core';

export const LONG_PRESS_DURATION_MS = 450;

type LongPressProps = {
  readonly longPressDuration: number;
  readonly onLongPress: (event: Event) => unknown;
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
          ? executeYieldable(value, [], context.injector)
          : value;
      return typeof resolved === 'number' ? resolved : LONG_PRESS_DURATION_MS;
    };

    const start = (event: Event) => {
      cancelTimer();
      longPressTriggered = false;
      suppressClickOnce = false;
      const configuredDurationMs = durationMs();
      timer = temporalRuntime.schedule(
        () => {
          timer = null;
          longPressTriggered = true;
          suppressClickOnce = true;
          const handler = context.props.onLongPress;
          if (typeof handler === 'function') {
            runCraftReplayTrigger(
              context.injector,
              {
                name: 'longPress',
                target: context.element,
                detail: {
                  durationMs: configuredDurationMs,
                  triggeredAtMs: temporalRuntime.now(),
                },
              },
              () => executeYieldable(handler, [event], context.injector),
            );
          }
        },
        configuredDurationMs,
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
