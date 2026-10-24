import type { SendContextSession } from '@craft-ts/core';
import { CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT } from './debug-session-replay-signals';

const SCROLL_SAMPLE_INTERVAL_MS = 100;
const SCROLL_MIN_DELTA_PX = 2;
const ACTION_BOUNDARY_EVENTS = [
  'pointerdown',
  'click',
  'keydown',
  'keyup',
  'input',
  'change',
  'submit',
] as const;

type ScrollPosition = Readonly<Record<string, string | number>>;
type PendingScroll = {
  latest: ScrollPosition;
  refresh?: () => ScrollPosition;
  captured?: ScrollPosition;
  lastCapturedAt: number;
  timer?: ReturnType<typeof setTimeout>;
};

/** Records autonomous viewport and element scrolling as replayable session steps. */
export function connectDebugSessionScrollCapture(
  session: SendContextSession,
): () => void {
  const pending = new Map<string, PendingScroll>();
  let paused = false;

  const capture = (
    key: string,
    name: string,
    payload: ScrollPosition,
    refresh: () => ScrollPosition,
  ) => {
    if (paused || !session.activeClip) return;
    let state = pending.get(key);
    if (!state) {
      state = {
        latest: payload,
        refresh,
        lastCapturedAt: Number.NEGATIVE_INFINITY,
      };
      pending.set(key, state);
    } else {
      if (sameScrollPosition(state.latest, payload)) return;
      state.latest = payload;
      state.refresh = refresh;
    }

    if (!hasMeaningfulScrollDelta(state.captured, state.latest)) return;

    const delay =
      SCROLL_SAMPLE_INTERVAL_MS - (performance.now() - state.lastCapturedAt);
    if (delay <= 0) {
      flush(key, name, state);
    } else if (state.timer === undefined) {
      state.timer = setTimeout(() => {
        state!.timer = undefined;
        flush(key, name, state!);
      }, delay);
    }
  };

  const viewportPosition = (): ScrollPosition => ({
    target: 'viewport',
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  });

  const onViewportScroll = () =>
    capture(
      'viewport',
      'Viewport scroll',
      viewportPosition(),
      viewportPosition,
    );

  const onElementScroll = (event: Event) => {
    const element = event.target;
    if (
      !(element instanceof HTMLElement) ||
      element === document.body ||
      element === document.documentElement
    )
      return;
    const selector = replaySelector(element);
    if (!selector) return;
    const position = (): ScrollPosition => ({
      target: 'element',
      selector,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
    });
    capture(
      `element:${selector}`,
      `Défilement · ${selector}`,
      position(),
      position,
    );
  };

  const flushPending = () => {
    for (const [key, state] of pending) {
      if (state.timer !== undefined) clearTimeout(state.timer);
      state.timer = undefined;
      if (!paused && session.activeClip) {
        const name =
          key === 'viewport'
            ? 'Viewport scroll'
            : `Défilement · ${key.slice('element:'.length)}`;
        flush(key, name, state, true);
      }
    }
  };

  const onReplayPersistence = (event: Event) => {
    const value = (event as CustomEvent<{ paused?: unknown }>).detail?.paused;
    if (typeof value !== 'boolean') return;
    paused = value;
    if (paused) {
      for (const state of pending.values()) {
        if (state.timer !== undefined) clearTimeout(state.timer);
        state.timer = undefined;
        state.latest = state.captured ?? state.latest;
        state.refresh = undefined;
      }
    }
  };

  const onActionBoundary = () => flushPending();

  window.addEventListener('scroll', onViewportScroll, { passive: true });
  window.addEventListener(
    CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
    onReplayPersistence,
  );
  document.addEventListener('scroll', onElementScroll, {
    capture: true,
    passive: true,
  });
  for (const eventName of ACTION_BOUNDARY_EVENTS)
    document.addEventListener(eventName, onActionBoundary, true);

  return () => {
    window.removeEventListener('scroll', onViewportScroll);
    window.removeEventListener(
      CRAFT_DEBUG_REPLAY_PERSISTENCE_EVENT,
      onReplayPersistence,
    );
    document.removeEventListener('scroll', onElementScroll, true);
    for (const eventName of ACTION_BOUNDARY_EVENTS)
      document.removeEventListener(eventName, onActionBoundary, true);
    flushPending();
  };

  function flush(
    key: string,
    name: string,
    state: PendingScroll,
    force = false,
  ): void {
    if (state.refresh) state.latest = state.refresh();
    if (sameScrollPosition(state.captured ?? {}, state.latest)) return;
    if (
      !force &&
      !hasMeaningfulScrollDelta(state.captured, state.latest)
    )
      return;
    state.lastCapturedAt = performance.now();
    state.captured = state.latest;
    session.capture('scroll', 'emitted', { name, payload: state.latest });
  }
}

function sameScrollPosition(a: ScrollPosition, b: ScrollPosition): boolean {
  return Object.keys(b).every((key) => a[key] === b[key]);
}

function hasMeaningfulScrollDelta(
  captured: ScrollPosition | undefined,
  latest: ScrollPosition,
): boolean {
  return ['scrollX', 'scrollY', 'scrollLeft', 'scrollTop'].some((key) => {
    const current = latest[key];
    if (typeof current !== 'number') return false;
    const previous = captured?.[key];
    const baseline = typeof previous === 'number' ? previous : 0;
    return Math.abs(current - baseline) > SCROLL_MIN_DELTA_PX;
  });
}

function replaySelector(element: HTMLElement): string | undefined {
  if (element.id) {
    const selector = `#${cssEscape(element.id)}`;
    if (isUnique(selector)) return selector;
  }
  for (const attribute of [
    'data-replay-id',
    'data-craft-name',
    'data-testid',
    'data-test',
    'data-cy',
  ]) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const selector = `[${attribute}="${cssStringEscape(value)}"]`;
    if (isUnique(selector)) return selector;
  }
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < 8) {
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (child) => child.tagName === current!.tagName,
        )
      : [];
    parts.unshift(
      `${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`,
    );
    current = current.parentElement;
    const selector = `body > ${parts.join(' > ')}`;
    if (isUnique(selector)) return selector;
  }
  return undefined;
}

function isUnique(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function cssStringEscape(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\a ')
    .replaceAll('\r', '\\d ')
    .replaceAll('\f', '\\c ');
}
