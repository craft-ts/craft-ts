import {
  ɵcaptureCraftReplayTarget,
  ɵstableReplaySelector,
  type SendContextSession,
} from '@craft-ts/core';
import {
  ɵcraftStyleClassesForSelfState,
  CRAFT_REPLAY_HOVER_ATTRIBUTE,
} from '@craft-ts/style';
import { CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT } from './debug-session-replay-signals';

type HoverTarget = Readonly<{
  element: Element;
  selector: string;
  replayTarget: ReturnType<typeof ɵcaptureCraftReplayTarget>;
  craftStyled: boolean;
}>;

const semanticTarget = (element: Element): Element =>
  element.closest(
    'button, a[href], input, select, textarea, [role="button"], [data-craft-name], [data-testid]',
  ) ?? element;

function replayTargetsFor(
  element: Element,
  includeSemanticFallback = true,
): Map<Element, HoverTarget> {
  const hoverClasses = ɵcraftStyleClassesForSelfState('hover');
  const candidates: Element[] = [];
  let current: Node | null = element;
  while (current) {
    if (current instanceof Element) candidates.push(current);
    if (current.parentNode) current = current.parentNode;
    else if (current instanceof ShadowRoot) current = current.host;
    else current = null;
  }
  const craftTargets = candidates.filter((candidate) =>
    [...candidate.classList].some((className) => hoverClasses.has(className)),
  );
  const craftTargetSet = new Set(craftTargets);
  const targets =
    craftTargets.length > 0
      ? craftTargets
      : includeSemanticFallback
        ? [semanticTarget(element)]
        : [];
  return new Map(
    targets.map((target): [Element, HoverTarget] => {
      const selector = ɵstableReplaySelector(target);
      return [
        target,
        {
          element: target,
          selector,
          replayTarget: ɵcaptureCraftReplayTarget(target, { selector }),
          craftStyled: craftTargetSet.has(target),
        },
      ];
    }),
  );
}

/** Records semantic pointer entry and exit without recording every mouse move. */
export function connectDebugSessionHoverCapture(
  session: SendContextSession,
): () => void {
  const hoveredByPointer = new Map<number, Map<Element, HoverTarget>>();
  let paused = false;

  const pointerId = (event: Event): number =>
    'pointerId' in event && typeof event.pointerId === 'number'
      ? event.pointerId
      : 1;

  const capture = (
    event: Event,
    action: 'enter' | 'leave',
    targets: readonly HoverTarget[],
  ) => {
    if (paused || !session.activeClip || targets.length === 0) return;
    const pointer = event as PointerEvent;
    const primary = targets[0]!;
    const craftTargets = targets.filter((target) => target.craftStyled);
    session.capture('hover', 'emitted', {
      name: `hover:${action}`,
      payload: {
        action,
        selector: primary.selector,
        ...(primary.replayTarget ? { replayTarget: primary.replayTarget } : {}),
        craftHoverTargets: craftTargets.map((target) => ({
          selector: target.selector,
          ...(target.replayTarget ? { replayTarget: target.replayTarget } : {}),
        })),
        pointerId: pointerId(event),
        ...(typeof pointer.pointerType === 'string'
          ? { pointerType: pointer.pointerType }
          : {}),
        clientX: Number.isFinite(pointer.clientX) ? pointer.clientX : 0,
        clientY: Number.isFinite(pointer.clientY) ? pointer.clientY : 0,
      },
      targets: targets.map((target) => ({
        tagName: target.element.tagName,
        selector: target.selector,
      })),
    });
  };

  const updatePointer = (
    event: Event,
    id: number,
    nextTargets: Map<Element, HoverTarget>,
  ) => {
    const previous =
      hoveredByPointer.get(id) ?? new Map<Element, HoverTarget>();
    const leaving = [...previous]
      .filter(([element]) => !nextTargets.has(element))
      .map(([, target]) => target);
    const entering = [...nextTargets]
      .filter(([element]) => !previous.has(element))
      .map(([, target]) => target);
    if (leaving.length > 0) capture(event, 'leave', leaving);
    if (entering.length > 0) capture(event, 'enter', entering);
    if (nextTargets.size > 0) hoveredByPointer.set(id, nextTargets);
    else hoveredByPointer.delete(id);
  };

  const onPointerOver = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    updatePointer(event, pointerId(event), replayTargetsFor(event.target));
  };

  const onPointerOut = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const related = (event as MouseEvent).relatedTarget;
    const id = pointerId(event);
    let nextTargets =
      related instanceof Element
        ? replayTargetsFor(related, false)
        : new Map<Element, HoverTarget>();
    const previous = hoveredByPointer.get(id);
    if (related instanceof Element && nextTargets.size === 0 && previous) {
      nextTargets = new Map(
        [...previous].filter(([element]) => element.contains(related)),
      );
    }
    updatePointer(event, id, nextTargets);
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
