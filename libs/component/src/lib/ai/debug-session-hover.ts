import {
  ɵcaptureCraftReplayTarget,
  ɵstableReplaySelector,
  type SendContextSession,
} from '@craft-ts/core';
import { CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT } from './debug-session-replay-signals';

type HoverTarget = Readonly<{ element: Element; selector: string }>;

/** Records semantic pointer entry and exit without recording every mouse move. */
export function connectDebugSessionHoverCapture(
  session: SendContextSession,
): () => void {
  const hoveredByPointer = new Map<number, HoverTarget>();
  let paused = false;

  const pointerId = (event: Event): number =>
    'pointerId' in event && typeof event.pointerId === 'number'
      ? event.pointerId
      : 1;

  const semanticTarget = (element: Element): Element =>
    element.closest(
      'button, a[href], input, select, textarea, [role="button"], [data-craft-name], [data-testid]',
    ) ?? element;

  const capture = (
    event: Event,
    action: 'enter' | 'leave',
    target: HoverTarget,
  ) => {
    if (paused || !session.activeClip) return;
    const pointer = event as PointerEvent;
    session.capture('hover', 'emitted', {
      name: `hover:${action}`,
      payload: {
        action,
        selector: target.selector,
        replayTarget: ɵcaptureCraftReplayTarget(target.element, {
          selector: target.selector,
          clientX: Number.isFinite(pointer.clientX) ? pointer.clientX : 0,
          clientY: Number.isFinite(pointer.clientY) ? pointer.clientY : 0,
        }),
        clientX: Number.isFinite(pointer.clientX) ? pointer.clientX : 0,
        clientY: Number.isFinite(pointer.clientY) ? pointer.clientY : 0,
        ...(typeof pointer.pointerType === 'string'
          ? { pointerType: pointer.pointerType }
          : {}),
      },
      targets: [{ tagName: target.element.tagName, selector: target.selector }],
    });
  };

  const onPointerOver = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const element = semanticTarget(event.target);
    const related = (event as MouseEvent).relatedTarget;
    if (related instanceof Node && element.contains(related)) return;
    const selector = ɵstableReplaySelector(element);
    const id = pointerId(event);
    const previous = hoveredByPointer.get(id);
    if (previous?.element === element) return;
    if (previous) capture(event, 'leave', previous);
    const target = { element, selector };
    hoveredByPointer.set(id, target);
    capture(event, 'enter', target);
  };

  const onPointerOut = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const element = semanticTarget(event.target);
    const related = (event as MouseEvent).relatedTarget;
    if (related instanceof Node && element.contains(related)) return;
    const id = pointerId(event);
    const previous = hoveredByPointer.get(id);
    if (!previous || previous.element !== element) return;
    capture(event, 'leave', previous);
    hoveredByPointer.delete(id);
  };

  const onReplayPersistence = (event: Event) => {
    const value = (event as CustomEvent<{ paused?: unknown }>).detail?.paused;
    if (typeof value !== 'boolean') return;
    paused = value;
    if (paused) hoveredByPointer.clear();
  };

  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);
  window.addEventListener(
    CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
    onReplayPersistence,
  );

  return () => {
    hoveredByPointer.clear();
    document.removeEventListener('pointerover', onPointerOver, true);
    document.removeEventListener('pointerout', onPointerOut, true);
    window.removeEventListener(
      CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
      onReplayPersistence,
    );
  };
}
