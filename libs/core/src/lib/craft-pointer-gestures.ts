import {
  craftNodeDirective,
  type CraftNodeDirective,
  type CraftNodeDirectiveContext,
} from './craft-node-directive';
import { executeYieldable } from './yieldable';
import { runCraftReplayTrigger } from './craft-replay-trigger';
import { CRAFT_TEMPORAL_RUNTIME } from './temporal-runtime';

export type CraftPointerPoint = Readonly<{
  clientX: number;
  clientY: number;
}>;

export type CraftPointerGesture = Readonly<{
  start: CraftPointerPoint;
  end: CraftPointerPoint;
  deltaX: number;
  deltaY: number;
  distancePx: number;
  durationMs: number;
  pointerType: string;
}>;

export type CraftSwipeGesture = CraftPointerGesture &
  Readonly<{
    direction: 'left' | 'right' | 'up' | 'down';
    velocityPxPerMs: number;
  }>;

export type CraftDragProps = Readonly<{
  dragThreshold?: number;
  dragIgnoreSelector?: string;
  onDragStart?: (gesture: CraftPointerGesture, element: Element) => unknown;
  onDragPreview?: (gesture: CraftPointerGesture, element: Element) => unknown;
  onDrop?: (gesture: CraftPointerGesture, element: Element) => unknown;
  onDragCancel?: (gesture: CraftPointerGesture, element: Element) => unknown;
}>;

export type CraftSwipeProps = Readonly<{
  swipeIgnoreSelector?: string;
  swipeMinDistance?: number;
  swipeMaxDurationMs?: number;
  onSwipe?: (gesture: CraftSwipeGesture, element: Element) => unknown;
}>;

const DEFAULT_DRAG_THRESHOLD_PX = 4;
const DEFAULT_SWIPE_MIN_DISTANCE_PX = 48;
const DEFAULT_SWIPE_MAX_DURATION_MS = 1_000;
const DEFAULT_DRAG_IGNORE_SELECTOR =
  'button, a[href], input, select, textarea, [data-craft-no-drag]';
type EmptyProps = Readonly<Record<never, never>>;

type ActivePointer = Readonly<{
  pointerId: number;
  start: CraftPointerPoint;
  startedAt: number;
  pointerType: string;
}>;

/**
 * Adds pointer dragging to a node. `onDragPreview` is for transient visual
 * feedback. Only `onDrop` and `onDragCancel` are semantic replay triggers;
 * start and preview callbacks are presentation hooks.
 */
export function drag(
  props: CraftDragProps = {},
): CraftNodeDirective<EmptyProps> {
  return craftNodeDirective<EmptyProps>('drag', [], (context) => {
    const temporalRuntime = context.injector.get(CRAFT_TEMPORAL_RUNTIME);
    let active: ActivePointer | undefined;
    let dragging = false;
    let suppressClickOnce = false;

    const threshold = () =>
      positiveNumber(props.dragThreshold, DEFAULT_DRAG_THRESHOLD_PX);

    const ignoreSelector = () =>
      props.dragIgnoreSelector ?? DEFAULT_DRAG_IGNORE_SELECTOR;

    const onPointerDown = (event: Event) => {
      const pointer = event as PointerEvent;
      if (pointer.button !== 0 || pointer.isPrimary === false) return;
      const target = pointer.target;
      if (
        target instanceof Element &&
        target !== context.element &&
        target.closest(ignoreSelector())
      )
        return;
      active = {
        pointerId: pointer.pointerId,
        start: point(pointer),
        startedAt: temporalRuntime.now(),
        pointerType: pointer.pointerType || 'unknown',
      };
      dragging = false;
      suppressClickOnce = false;
      capturePointer(context.element, pointer.pointerId);
    };

    const onPointerMove = (event: Event) => {
      const pointer = event as PointerEvent;
      if (!active || pointer.pointerId !== active.pointerId) return;
      const gesture = snapshot(active, pointer, temporalRuntime.now());
      if (!dragging && gesture.distancePx < threshold()) return;
      if (!dragging) {
        dragging = true;
        invokePresentationHandler(context, props.onDragStart, gesture);
      }
      invokePresentationHandler(context, props.onDragPreview, gesture);
      pointer.preventDefault();
    };

    const onPointerUp = (event: Event) => {
      const pointer = event as PointerEvent;
      if (!active || pointer.pointerId !== active.pointerId) return;
      const gesture = snapshot(active, pointer, temporalRuntime.now());
      const wasDragging = dragging;
      clearPointer(context.element, pointer.pointerId);
      active = undefined;
      dragging = false;
      if (!wasDragging) return;
      suppressClickOnce = true;
      invokeReplayHandler(context, props.onDrop, 'drop', gesture, pointer);
    };

    const onPointerCancel = (event: Event) => {
      const pointer = event as PointerEvent;
      if (!active || pointer.pointerId !== active.pointerId) return;
      const gesture = snapshot(active, pointer, temporalRuntime.now());
      const wasDragging = dragging;
      clearPointer(context.element, pointer.pointerId);
      active = undefined;
      dragging = false;
      if (!wasDragging) return;
      suppressClickOnce = true;
      invokeReplayHandler(
        context,
        props.onDragCancel,
        'dragCancel',
        gesture,
        pointer,
      );
    };

    const onClick = (event: Event) => {
      if (!suppressClickOnce) return;
      suppressClickOnce = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const unlisten = [
      context.renderer.listen(context.element, 'pointerdown', onPointerDown),
      context.renderer.listen(context.element, 'pointermove', onPointerMove),
      context.renderer.listen(context.element, 'pointerup', onPointerUp),
      context.renderer.listen(
        context.element,
        'pointercancel',
        onPointerCancel,
      ),
    ];
    context.element.addEventListener('click', onClick, true);

    return () => {
      if (active) clearPointer(context.element, active.pointerId);
      active = undefined;
      unlisten.forEach((cleanup) => cleanup());
      context.element.removeEventListener('click', onClick, true);
    };
  });
}

/** Recognizes a short directional pointer movement as one replayable action. */
export function swipe(
  props: CraftSwipeProps = {},
): CraftNodeDirective<EmptyProps> {
  return craftNodeDirective<EmptyProps>('swipe', [], (context) => {
    const temporalRuntime = context.injector.get(CRAFT_TEMPORAL_RUNTIME);
    let active: ActivePointer | undefined;
    let suppressClickOnce = false;

    const onPointerDown = (event: Event) => {
      const pointer = event as PointerEvent;
      if (pointer.button !== 0 || pointer.isPrimary === false) return;
      if (
        isIgnoredTarget(
          pointer.target,
          context.element,
          props.swipeIgnoreSelector ?? DEFAULT_DRAG_IGNORE_SELECTOR,
        )
      )
        return;
      active = {
        pointerId: pointer.pointerId,
        start: point(pointer),
        startedAt: temporalRuntime.now(),
        pointerType: pointer.pointerType || 'unknown',
      };
      suppressClickOnce = false;
      capturePointer(context.element, pointer.pointerId);
    };

    const onPointerUp = (event: Event) => {
      const pointer = event as PointerEvent;
      if (!active || pointer.pointerId !== active.pointerId) return;
      const gesture = snapshot(active, pointer, temporalRuntime.now());
      clearPointer(context.element, pointer.pointerId);
      active = undefined;
      const minDistance = positiveNumber(
        props.swipeMinDistance,
        DEFAULT_SWIPE_MIN_DISTANCE_PX,
      );
      const maxDuration = positiveNumber(
        props.swipeMaxDurationMs,
        DEFAULT_SWIPE_MAX_DURATION_MS,
      );
      if (gesture.distancePx < minDistance || gesture.durationMs > maxDuration)
        return;
      suppressClickOnce = true;
      const swipeGesture: CraftSwipeGesture = {
        ...gesture,
        direction:
          Math.abs(gesture.deltaX) > Math.abs(gesture.deltaY)
            ? gesture.deltaX < 0
              ? 'left'
              : 'right'
            : gesture.deltaY < 0
              ? 'up'
              : 'down',
        velocityPxPerMs: gesture.distancePx / Math.max(gesture.durationMs, 1),
      };
      invokeReplayHandler(
        context,
        props.onSwipe,
        'swipe',
        swipeGesture,
        pointer,
      );
      pointer.preventDefault();
    };

    const onPointerCancel = (event: Event) => {
      const pointer = event as PointerEvent;
      if (!active || pointer.pointerId !== active.pointerId) return;
      clearPointer(context.element, pointer.pointerId);
      active = undefined;
    };

    const onClick = (event: Event) => {
      if (!suppressClickOnce) return;
      suppressClickOnce = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const unlisten = [
      context.renderer.listen(context.element, 'pointerdown', onPointerDown),
      context.renderer.listen(context.element, 'pointerup', onPointerUp),
      context.renderer.listen(
        context.element,
        'pointercancel',
        onPointerCancel,
      ),
    ];
    context.element.addEventListener('click', onClick, true);

    return () => {
      if (active) clearPointer(context.element, active.pointerId);
      active = undefined;
      unlisten.forEach((cleanup) => cleanup());
      context.element.removeEventListener('click', onClick, true);
    };
  });
}

function point(event: PointerEvent): CraftPointerPoint {
  return { clientX: event.clientX, clientY: event.clientY };
}

function snapshot(
  active: ActivePointer,
  event: PointerEvent,
  now: number,
): CraftPointerGesture {
  const end = point(event);
  const deltaX = end.clientX - active.start.clientX;
  const deltaY = end.clientY - active.start.clientY;
  return {
    start: active.start,
    end,
    deltaX,
    deltaY,
    distancePx: Math.hypot(deltaX, deltaY),
    durationMs: Math.max(0, now - active.startedAt),
    pointerType: active.pointerType,
  };
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function capturePointer(element: Element, pointerId: number): void {
  if (typeof HTMLElement === 'undefined' || !(element instanceof HTMLElement))
    return;
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic events and detached elements cannot acquire pointer capture.
  }
}

function clearPointer(element: Element, pointerId: number): void {
  if (typeof HTMLElement === 'undefined' || !(element instanceof HTMLElement))
    return;
  try {
    if (element.hasPointerCapture(pointerId))
      element.releasePointerCapture(pointerId);
  } catch {
    // The browser releases capture automatically after pointerup/cancel.
  }
}

function invokeReplayHandler<Gesture extends CraftPointerGesture>(
  context: CraftNodeDirectiveContext<EmptyProps>,
  handler: ((gesture: Gesture, element: Element) => unknown) | undefined,
  name: string,
  gesture: Gesture,
  event: PointerEvent,
): void {
  if (typeof handler !== 'function') return;
  runCraftReplayTrigger(
    context.injector,
    {
      name,
      target: context.element,
      coordinates: { clientX: event.clientX, clientY: event.clientY },
      detail: {
        startX: gesture.start.clientX,
        startY: gesture.start.clientY,
        endX: gesture.end.clientX,
        endY: gesture.end.clientY,
        deltaX: gesture.deltaX,
        deltaY: gesture.deltaY,
        distancePx: gesture.distancePx,
        durationMs: gesture.durationMs,
        pointerType: gesture.pointerType,
        ...('direction' in gesture && typeof gesture.direction === 'string'
          ? { direction: gesture.direction }
          : {}),
      },
    },
    () =>
      executeYieldable(handler, [gesture, context.element], context.injector),
  );
}

function invokePresentationHandler<Gesture extends CraftPointerGesture>(
  context: CraftNodeDirectiveContext<EmptyProps>,
  handler: ((gesture: Gesture, element: Element) => unknown) | undefined,
  gesture: Gesture,
): void {
  if (typeof handler === 'function')
    executeYieldable(handler, [gesture, context.element], context.injector);
}

function isIgnoredTarget(
  target: EventTarget | null,
  host: Element,
  selector: string,
): boolean {
  return (
    target instanceof Element && target !== host && !!target.closest(selector)
  );
}
