import {
  ɵcaptureCraftReplayTarget,
  ɵstableReplaySelector,
  type SendContextSession,
} from '@craft-ts/core';
import { ɵcraftStyleClassesForSelfState } from '@craft-ts/style';
import { CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT } from './debug-session-replay-signals';

type SelfState = 'hover' | 'focus' | 'active';
type VisualState = SelfState | 'focusVisible';
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

function targetFor(element: Element, craftStyled: boolean): HoverTarget {
  const selector = ɵstableReplaySelector(element);
  return {
    element,
    selector,
    replayTarget: ɵcaptureCraftReplayTarget(element, { selector }),
    craftStyled,
  };
}

function targetsForSelfState(
  element: Element,
  state: SelfState,
  includeAncestors: boolean,
): Map<Element, HoverTarget> {
  const classes = ɵcraftStyleClassesForSelfState(state);
  const candidates: Element[] = [element];
  if (includeAncestors) {
    let current: Node | null = element.parentNode;
    while (current) {
      if (current instanceof Element) candidates.push(current);
      if (current.parentNode) current = current.parentNode;
      else if (current instanceof ShadowRoot) current = current.host;
      else current = null;
    }
  }
  const targets = candidates.filter((candidate) =>
    [...candidate.classList].some((className) => classes.has(className)),
  );
  return new Map(
    targets.map((target) => [target, targetFor(target, true)] as const),
  );
}

function hoverTargetsFor(
  element: Element,
  includeSemanticFallback = true,
): Map<Element, HoverTarget> {
  const targets = targetsForSelfState(element, 'hover', true);
  if (targets.size > 0)
    return new Map(
      [...targets].map(([target, value]) => [
        target,
        { ...value, craftStyled: true },
      ]),
    );
  if (!includeSemanticFallback) return new Map();
  const target = semanticTarget(element);
  return new Map([[target, targetFor(target, false)]]);
}

function targetsForVisualState(
  element: Element,
  state: VisualState,
): Map<Element, HoverTarget> {
  if (state === 'focusVisible') {
    try {
      if (!element.matches(':focus-visible')) return new Map();
    } catch {
      return new Map();
    }
    // The focus-visible marker also reproduces Craft's global focus ring and
    // descendant.focusVisible variants, even when the target has no own class.
    return new Map([[element, targetFor(element, true)]]);
  }
  return targetsForSelfState(element, state, state === 'active');
}

/** Records semantic pointer and keyboard state transitions, never pointermove. */
export function connectDebugSessionHoverCapture(
  session: SendContextSession,
  options: Readonly<{ hover?: boolean; focusActive?: boolean }> = {},
): () => void {
  const captureHover = options.hover ?? true;
  const captureFocusActive = options.focusActive ?? true;
  const hoveredByPointer = new Map<number, Map<Element, HoverTarget>>();
  const activeByPointer = new Map<number, Map<Element, HoverTarget>>();
  let focused:
    | Readonly<{
        element: Element;
        focusTargets: Map<Element, HoverTarget>;
        focusVisibleTargets: Map<Element, HoverTarget>;
      }>
    | undefined;
  let keyboardActive: Map<Element, HoverTarget> | undefined;
  let keyboardActiveKey: string | undefined;
  let paused = false;

  const pointerId = (event: Event): number =>
    'pointerId' in event && typeof event.pointerId === 'number'
      ? event.pointerId
      : 1;

  const capture = (
    event: Event,
    action: 'enter' | 'leave',
    targets: readonly HoverTarget[],
    visualState: VisualState,
    id = pointerId(event),
  ) => {
    const primary = targets[0];
    if (paused || !session.activeClip || !primary) return;
    const pointer = event as PointerEvent;
    const craftTargets = targets.filter((target) => target.craftStyled);
    session.capture('hover', 'emitted', {
      name:
        visualState === 'hover'
          ? `hover:${action}`
          : `interaction:${visualState}:${action}`,
      payload: {
        action,
        selector: primary.selector,
        ...(primary.replayTarget ? { replayTarget: primary.replayTarget } : {}),
        ...(visualState === 'hover'
          ? {
              craftHoverTargets: craftTargets.map((target) => ({
                selector: target.selector,
                ...(target.replayTarget
                  ? { replayTarget: target.replayTarget }
                  : {}),
              })),
            }
          : {
              interactionState: visualState,
              craftStateTargets: targets.map((target) => ({
                state: visualState,
                selector: target.selector,
                ...(target.replayTarget
                  ? { replayTarget: target.replayTarget }
                  : {}),
              })),
            }),
        pointerId: id,
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
    previousByPointer: Map<number, Map<Element, HoverTarget>>,
    visualState: VisualState,
  ) => {
    const previous =
      previousByPointer.get(id) ?? new Map<Element, HoverTarget>();
    const leaving = [...previous]
      .filter(([element]) => !nextTargets.has(element))
      .map(([, target]) => target);
    const entering = [...nextTargets]
      .filter(([element]) => !previous.has(element))
      .map(([, target]) => target);
    if (leaving.length > 0) capture(event, 'leave', leaving, visualState, id);
    if (entering.length > 0) capture(event, 'enter', entering, visualState, id);
    if (nextTargets.size > 0) previousByPointer.set(id, nextTargets);
    else previousByPointer.delete(id);
  };

  const onPointerOver = (event: Event) => {
    if (!captureHover || !(event.target instanceof Element)) return;
    updatePointer(
      event,
      pointerId(event),
      hoverTargetsFor(event.target),
      hoveredByPointer,
      'hover',
    );
  };

  const onPointerOut = (event: Event) => {
    if (!captureHover || !(event.target instanceof Element)) return;
    const related = (event as MouseEvent).relatedTarget;
    const id = pointerId(event);
    let nextTargets =
      related instanceof Element
        ? hoverTargetsFor(related, false)
        : new Map<Element, HoverTarget>();
    const previous = hoveredByPointer.get(id);
    if (related instanceof Element && nextTargets.size === 0 && previous) {
      nextTargets = new Map(
        [...previous].filter(([element]) => element.contains(related)),
      );
    }
    updatePointer(event, id, nextTargets, hoveredByPointer, 'hover');
  };

  const onPointerDown = (event: Event) => {
    if (!captureFocusActive || !(event.target instanceof Element)) return;
    const id = pointerId(event);
    updatePointer(
      event,
      id,
      targetsForVisualState(event.target, 'active'),
      activeByPointer,
      'active',
    );
  };

  const onPointerEnd = (event: Event) => {
    if (!captureFocusActive) return;
    const id = pointerId(event);
    updatePointer(event, id, new Map(), activeByPointer, 'active');
  };

  const onKeyDown = (event: Event) => {
    const key = event as KeyboardEvent;
    if (
      !captureFocusActive ||
      key.repeat ||
      (key.key !== ' ' && key.key !== 'Enter') ||
      !(event.target instanceof Element)
    )
      return;
    const targets = targetsForVisualState(event.target, 'active');
    if (targets.size === 0) return;
    keyboardActive = targets;
    keyboardActiveKey = key.key;
    capture(event, 'enter', [...targets.values()], 'active', -2);
  };

  const onKeyUp = (event: Event) => {
    if (
      !captureFocusActive ||
      !keyboardActive ||
      (event as KeyboardEvent).key !== keyboardActiveKey
    )
      return;
    capture(event, 'leave', [...keyboardActive.values()], 'active', -2);
    keyboardActive = undefined;
    keyboardActiveKey = undefined;
  };

  const onFocusIn = (event: Event) => {
    if (!captureFocusActive || !(event.target instanceof Element)) return;
    if (focused) onFocusOutFor(focused, event);
    const element = event.target;
    const focusTargets = targetsForVisualState(element, 'focus');
    const focusVisibleTargets = targetsForVisualState(element, 'focusVisible');
    focused = { element, focusTargets, focusVisibleTargets };
    if (focusTargets.size > 0)
      capture(event, 'enter', [...focusTargets.values()], 'focus', -1);
    if (focusVisibleTargets.size > 0)
      capture(
        event,
        'enter',
        [...focusVisibleTargets.values()],
        'focusVisible',
        -1,
      );
  };

  const onFocusOutFor = (value: NonNullable<typeof focused>, event: Event) => {
    if (value.focusTargets.size > 0)
      capture(event, 'leave', [...value.focusTargets.values()], 'focus', -1);
    if (value.focusVisibleTargets.size > 0)
      capture(
        event,
        'leave',
        [...value.focusVisibleTargets.values()],
        'focusVisible',
        -1,
      );
    if (focused === value) focused = undefined;
  };

  const onFocusOut = (event: Event) => {
    if (!captureFocusActive || !(event.target instanceof Element) || !focused)
      return;
    if (focused.element === event.target) onFocusOutFor(focused, event);
  };

  const onReplayPersistence = (event: Event) => {
    const value = (event as CustomEvent<{ paused?: unknown }>).detail?.paused;
    if (typeof value !== 'boolean') return;
    paused = value;
    if (paused) {
      hoveredByPointer.clear();
      activeByPointer.clear();
      focused = undefined;
      keyboardActive = undefined;
      keyboardActiveKey = undefined;
    }
  };

  if (captureHover) {
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
  }
  if (captureFocusActive) {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerEnd, true);
    document.addEventListener('pointercancel', onPointerEnd, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
  }
  window.addEventListener(
    CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
    onReplayPersistence,
  );

  return () => {
    hoveredByPointer.clear();
    activeByPointer.clear();
    focused = undefined;
    keyboardActive = undefined;
    keyboardActiveKey = undefined;
    document.removeEventListener('pointerover', onPointerOver, true);
    document.removeEventListener('pointerout', onPointerOut, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerEnd, true);
    document.removeEventListener('pointercancel', onPointerEnd, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    window.removeEventListener(
      CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
      onReplayPersistence,
    );
  };
}
