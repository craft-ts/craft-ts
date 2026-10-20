import { DestroyRef } from './host/craft-compat';
import {
  CRAFT_TEMPORAL_RUNTIME,
  type TemporalTaskHandle,
} from './temporal-runtime';
import { craftNodeDirective } from './craft-node-directive';
import { executeYieldable } from './yieldable';
import { runCraftReplayTrigger } from './craft-replay-trigger';

export const LONG_PRESS_DURATION_MS = 450;

export type LongPressProps = Readonly<{
  longPressDuration?: number;
  onLongPress: (event: Event) => unknown;
}>;

/**
 * Emits `onLongPress` after the host stays pressed for `longPressDuration` ms.
 * The release click is swallowed after a successful long press. During replay,
 * the semantic trigger is recorded and its Craft invocations are replayed
 * without redispatching pointer events or calling the handler again.
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
                ...(hasPointerCoordinates(event)
                  ? {
                      coordinates: {
                        clientX: event.clientX,
                        clientY: event.clientY,
                      },
                    }
                  : {}),
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
      if (!suppressClickOnce && !longPressTriggered) return;
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

function hasPointerCoordinates(
  event: Event,
): event is Event & { clientX: number; clientY: number } {
  return (
    'clientX' in event &&
    typeof event.clientX === 'number' &&
    'clientY' in event &&
    typeof event.clientY === 'number'
  );
}
