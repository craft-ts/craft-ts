import {
  craftNodeDirective,
  type CraftNodeDirectiveContext,
} from '@craft-ts/core';
import { assign, num, unit } from '@craft-ts/style';
import { frameVars, markerVars, ui, viewportVars } from './dashboard.style';
import type {
  ReplayDialogView,
  ReplayTimer,
  ReplayViewport,
} from './replay-model';

/**
 * Where the replay meets the browser. It reaches it only the way Craft lets a
 * template do: through the Craft temporal runtime, the `@craft-ts` browser
 * boundaries, and a node directive (`replayHost`) that is handed the root
 * element of the dashboard and its DOM adapter. Nothing here names `window`,
 * `document`, `performance`, `crypto` or `location`.
 *
 * - The `platform` is installed by the route service, which resolves the
 *   temporal runtime and the `BrowserLocation`/`BrowserCrypto` boundaries from
 *   the injector: timers, the monotonic clock, ids and the hash.
 * - The `host` is the directive's: the replayed page's window (`postMessage`,
 *   `message`, `hashchange`) is the root element's `defaultView`, its frames are
 *   drawn with the DOM adapter, and every lookup is scoped to the root element.
 *
 * Until they are installed the functions are inert, as they were before the
 * elements existed.
 */

/* ── the platform: time, ids, the hash ──────────────────────────────────── */

export type ReplayPlatform = Readonly<{
  /** Runs `run` once, `delayMs` from now, on the Craft temporal runtime. */
  schedule: (run: () => void, delayMs: number) => ReplayTimer;
  /** A monotonic clock, for durations. */
  now: () => number;
  uuid: () => string;
  hash: () => string;
  /** The query string of the dashboard's own address. */
  search: () => string;
  navigate: (hash: string) => void;
}>;

const INERT_TIMER: ReplayTimer = { cancel: () => undefined };

const INERT_PLATFORM: ReplayPlatform = {
  schedule: () => INERT_TIMER,
  now: () => 0,
  uuid: () => '',
  hash: () => '',
  search: () => '',
  navigate: () => undefined,
};

let platform: ReplayPlatform = INERT_PLATFORM;

export function installReplayPlatform(next: ReplayPlatform): void {
  platform = next;
}

export function after(delayMs: number, run: () => void): ReplayTimer {
  return platform.schedule(run, delayMs);
}

export function cancelAfter(timer: ReplayTimer): void {
  timer.cancel();
}

/** Runs `run` every `periodMs` until cancelled; a tick never overlaps the next. */
export function every(periodMs: number, run: () => void): ReplayTimer {
  let stopped = false;
  let pending: ReplayTimer = INERT_TIMER;
  const tick = () => {
    if (stopped) return;
    run();
    if (!stopped) pending = platform.schedule(tick, periodMs);
  };
  pending = platform.schedule(tick, periodMs);
  return {
    cancel: () => {
      stopped = true;
      pending.cancel();
    },
  };
}

export function cancelEvery(timer: ReplayTimer): void {
  timer.cancel();
}

export function monotonicMs(): number {
  return platform.now();
}

export function newUuid(): string {
  return platform.uuid();
}

/* ── the hash route ─────────────────────────────────────────────────────── */

export function currentHash(): string {
  return platform.hash();
}

/**
 * The dashboard was opened by the thumbnail worker (`?replay-worker=1`): a
 * hidden browser that replays a recording to photograph it. It drives the page
 * through a control surface rather than its buttons, and does not start
 * workers of its own.
 */
export function isReplayWorkerMode(): boolean {
  return new URLSearchParams(platform.search()).get('replay-worker') === '1';
}

/** Hands the worker's browser the control surface, on the page's global. */
export function exposeReplayWorkerSurface(surface: object): void {
  Object.defineProperty(globalThis, '__craftReplayWorker', {
    value: surface,
    configurable: true,
  });
}

export function goToHash(hash: string): void {
  platform.navigate(hash);
}

const hashListeners: Array<() => void> = [];

export function onHashChange(run: () => void): void {
  hashListeners.push(run);
}

/* ── the replayed page's messages ───────────────────────────────────────── */

export type FrameMessage = Readonly<{
  source: MessageEventSource | null;
  origin: string;
  data: unknown;
}>;

const messageListeners: Array<(message: FrameMessage) => void> = [];

export function onWindowMessage(run: (message: FrameMessage) => void): void {
  messageListeners.push(run);
}

/* ── the host: the root element and its DOM adapter ─────────────────────── */

type Host = Readonly<{
  root: Element;
  context: CraftNodeDirectiveContext;
}>;

let host: Host | undefined;

/** The element with this id, among the descendants of the dashboard's root. */
function byId(id: string): HTMLElement | null {
  return host?.root.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ?? null;
}

function frames(): readonly HTMLIFrameElement[] {
  return Array.from(
    host?.root.querySelectorAll<HTMLIFrameElement>(
      'iframe[data-replay-participant]',
    ) ?? [],
  );
}

/**
 * Mounted on the root element of the dashboard. It hands the replay the
 * element's DOM adapter, listens to the page's window for `message` and
 * `hashchange`, and lets go of both when the dashboard is destroyed.
 */
export const replayHost = craftNodeDirective<Readonly<Record<string, never>>>(
  'replayHost',
  [],
  (context) => {
    host = { root: context.element, context };
    const view = context.element.ownerDocument.defaultView;
    const unlisten: Array<() => void> = [];
    if (view) {
      unlisten.push(
        context.renderer.listen(view, 'message', (event) => {
          if (!(event instanceof MessageEvent)) return;
          const message: FrameMessage = {
            source: event.source,
            origin: event.origin,
            data: event.data,
          };
          for (const run of messageListeners) run(message);
        }),
        context.renderer.listen(view, 'hashchange', () => {
          for (const run of hashListeners) run();
        }),
      );
    }
    return () => {
      for (const stop of unlisten) stop();
      host = undefined;
    };
  },
);

/* ── the event's own control ────────────────────────────────────────────── */

/** The first file a file input holds after a change, if any. */
export function firstSelectedFile(event: Event): File | undefined {
  const target = event.target;
  return target instanceof HTMLInputElement ? target.files?.[0] : undefined;
}

/**
 * How far along the control a pointer event landed, from 0 (its start) to 1
 * (its end). The control is the one the handler is bound to.
 */
export function pointerShare(event: MouseEvent): number {
  const control = event.currentTarget;
  if (!(control instanceof HTMLElement)) return 0;
  const box = control.getBoundingClientRect();
  return box.width > 0
    ? Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    : 0;
}

/** Offers a text as a download, the way a link to a blob does. */
export function saveTextFile(name: string, type: string, text: string): void {
  const renderer = host?.context.renderer;
  const download = renderer?.createElement('a');
  if (!renderer || !(download instanceof HTMLAnchorElement)) return;
  const url = URL.createObjectURL(new Blob([text], { type }));
  renderer.setAttribute(download, 'href', url);
  renderer.setAttribute(download, 'download', name);
  download.click();
  URL.revokeObjectURL(url);
}

/**
 * Opens a page in a new tab that keeps its link to the dashboard (no
 * `noopener`): the page asks its opener for the state to start from. Null when
 * the browser blocked the tab.
 */
export function openLinkedTab(href: string): Window | null {
  return (
    host?.context.element.ownerDocument.defaultView?.open(href, '_blank') ??
    null
  );
}

/* ── the replayed page ──────────────────────────────────────────────────── */

export function frameFor(participantId: string): HTMLIFrameElement | undefined {
  return frames().find(
    (frame) => frame.dataset['replayParticipant'] === participantId,
  );
}

export function isFrameWindow(
  participantId: string,
  source: MessageEventSource | null,
): boolean {
  return frameFor(participantId)?.contentWindow === source;
}

/** Sends a message to a tab's frame. False when there is no page to hear it. */
export function postToFrame(
  participantId: string,
  message: Readonly<Record<string, unknown>>,
  origin: string,
): boolean {
  const target = frameFor(participantId)?.contentWindow;
  if (!target) return false;
  target.postMessage(message, origin);
  return true;
}

/** Points a tab's frame at a page. False when the frame is gone. */
export function loadFrame(participantId: string, href: string): boolean {
  const frame = frameFor(participantId);
  if (!frame || !host) return false;
  host.context.renderer.setAttribute(frame, 'src', href);
  return true;
}

export function hasFrame(participantId: string): boolean {
  return frameFor(participantId) !== undefined;
}

/** Whether the tab's frame holds a page that can be sent messages. */
export function frameHasWindow(participantId: string): boolean {
  return frameFor(participantId)?.contentWindow != null;
}

export function requestFrameFullscreen(participantId: string): void {
  void frameFor(participantId)?.requestFullscreen?.();
}

/* ── the frames' DOM ────────────────────────────────────────────────────── */

/**
 * The replay draws its frames with the DOM adapter, outside any template, so
 * there is no `style:` binding to carry a variable. This is the one place a
 * typed custom property is written onto an element: the value always comes from
 * `assign(token, …)` and the sheet reads the variable. Never a raw property.
 */
type TypedVars = Readonly<Record<`--${string}`, string>>;

function writeVars(element: HTMLElement, vars: TypedVars): void {
  for (const [name, value] of Object.entries(vars))
    element.style.setProperty(name, value);
}

function clearVars(
  element: HTMLElement,
  ...tokens: readonly { readonly declaration: { readonly name: string } }[]
): void {
  for (const token of tokens)
    element.style.removeProperty(token.declaration.name);
}

const GRID = 'replay-frame-grid';
const STAGE = 'replay-stage';

/** The first tab keeps the plain ids the end-to-end tests and the sheet know. */
let primaryParticipantId: string | undefined;

const cardId = (participantId: string) => `replay-frame-card-${participantId}`;
const urlId = (participantId: string) => `replay-frame-url-${participantId}`;
const placeholderId = (participantId: string) =>
  `replay-frame-placeholder-${participantId}`;
const dialogId = (participantId: string) =>
  `replay-dialog-overlay-${participantId}`;
const wrapperId = (participantId: string) =>
  primaryParticipantId === participantId
    ? 'replay-viewport-frame'
    : `replay-viewport-frame-${participantId}`;
const markerId = (participantId: string) =>
  primaryParticipantId === participantId
    ? 'replay-click-marker'
    : `replay-click-marker-${participantId}`;

export type FrameSpec = Readonly<{
  participantId: string;
  title: string;
  startUrl: string;
  /** The colour scheme the recording was made in. */
  colorScheme: 'dark' | 'light';
  hidden: boolean;
}>;

export function hasFrameGrid(): boolean {
  return byId(GRID) !== null;
}

/** Draws one tile per tab: title, address, the page's frame and its overlays. */
export function renderFrames(
  specs: readonly FrameSpec[],
  onFrameLoad: (participantId: string) => void,
): void {
  const grid = byId(GRID);
  const renderer = host?.context.renderer;
  if (!grid || !renderer) return;
  const element = (tag: string, className: string, lab: string): Element => {
    const created = renderer.createElement(tag);
    renderer.setAttribute(created, 'class', className);
    renderer.setAttribute(created, 'data-lab', lab);
    return created;
  };
  const hide = (target: Element, hidden: boolean) =>
    renderer.setProperty(target, 'hidden', hidden);
  const write = (target: Element, text: string) =>
    renderer.setProperty(target, 'textContent', text);
  grid.replaceChildren();
  primaryParticipantId = specs[0]?.participantId;
  specs.forEach((spec, index) => {
    const { participantId } = spec;
    const card = element('section', ui.tile, 'replay-tile');
    hide(card, spec.hidden);
    renderer.setAttribute(card, 'id', cardId(participantId));
    const title = element('h3', ui.tileTitle, 'replay-tile-title');
    const participantName = element('span', ui.tileName, 'replay-tile-name');
    write(participantName, spec.title);
    const activeBadge = element('span', ui.tileBadge, 'replay-active-badge');
    hide(activeBadge, true);
    renderer.appendChild(title, participantName);
    renderer.appendChild(title, activeBadge);
    const viewportFrame = element('div', ui.viewport, 'viewport-frame');
    renderer.setAttribute(viewportFrame, 'id', wrapperId(participantId));
    const frame = renderer.createElement('iframe');
    renderer.setAttribute(
      frame,
      'id',
      index === 0 ? 'replay-target' : `replay-target-${participantId}`,
    );
    renderer.setAttribute(frame, 'class', ui.frame);
    renderer.setAttribute(frame, 'data-replay-participant', participantId);
    renderer.setAttribute(frame, 'title', `${spec.title} · replay`);
    // The iframe inherits color-scheme from this dark dashboard. Pin its
    // embedded preference to the recording when available; old exports have
    // no theme metadata, so use light as the least surprising legacy default.
    renderer.setAttribute(frame, 'data-frame-scheme', spec.colorScheme);
    renderer.listen(frame, 'load', () => onFrameLoad(participantId));
    const placeholder = element(
      'div',
      ui.placeholder,
      'replay-frame-placeholder',
    );
    renderer.setAttribute(placeholder, 'id', placeholderId(participantId));
    hide(placeholder, true);
    const visibilityOverlay = element(
      'div',
      ui.veil,
      'replay-visibility-overlay',
    );
    hide(visibilityOverlay, true);
    renderer.setAttribute(
      visibilityOverlay,
      'aria-label',
      'Onglet non visible',
    );
    write(visibilityOverlay, 'Non visible');
    const marker = element('div', ui.marker, 'click-marker');
    renderer.setAttribute(marker, 'id', markerId(participantId));
    hide(marker, true);
    renderer.setAttribute(marker, 'aria-hidden', 'true');
    renderer.appendChild(
      marker,
      element('span', ui.markerRipple, 'click-marker-ripple'),
    );
    renderer.appendChild(
      marker,
      element('span', ui.markerRippleLate, 'click-marker-ripple'),
    );
    const dialogOverlay = element(
      'div',
      ui.pageDialog,
      'replay-dialog-overlay',
    );
    renderer.setAttribute(dialogOverlay, 'id', dialogId(participantId));
    hide(dialogOverlay, true);
    renderer.setAttribute(dialogOverlay, 'role', 'status');
    const dialogPanel = element('div', ui.pageDialogCard, 'replay-dialog');
    renderer.appendChild(
      dialogPanel,
      element('strong', ui.pageDialogTitle, 'replay-dialog-title'),
    );
    renderer.appendChild(
      dialogPanel,
      element('p', ui.pageDialogMessage, 'replay-dialog-message'),
    );
    renderer.appendChild(
      dialogPanel,
      element('small', ui.pageDialogResult, 'replay-dialog-result'),
    );
    renderer.appendChild(dialogOverlay, dialogPanel);
    const url = element('p', ui.tileUrl, 'replay-tile-url');
    renderer.setAttribute(url, 'id', urlId(participantId));
    write(url, spec.startUrl);
    renderer.setAttribute(url, 'title', spec.startUrl);
    // One tab: the head already says what is shown. The title earns its place
    // when several tabs share the stage.
    hide(title, specs.length === 1);
    hide(url, specs.length === 1);
    for (const child of [
      frame,
      visibilityOverlay,
      marker,
      dialogOverlay,
      placeholder,
    ])
      renderer.appendChild(viewportFrame, child);
    for (const child of [title, url, viewportFrame])
      renderer.appendChild(card, child);
    renderer.appendChild(grid, card);
  });
}

export function setTileHidden(participantId: string, hidden: boolean): void {
  const card = byId(cardId(participantId));
  if (card) card.hidden = hidden;
}

export function setFramePlaceholder(
  participantId: string,
  message: string,
): void {
  const placeholder = byId(placeholderId(participantId));
  if (!placeholder) return;
  placeholder.textContent = message;
  placeholder.hidden = message.length === 0;
}

/** Shows the address the replayed page is at. */
export function setFrameAddress(participantId: string, address: string): void {
  const element = byId(urlId(participantId));
  if (!element) return;
  element.textContent = address;
  element.title = address;
}

export type TilePaint = Readonly<{
  participantId: string;
  /** The tab the recording had in front. */
  focus: boolean;
  /** The tab the next action runs in. */
  action: boolean;
  badge: string;
  veil: Readonly<{ message: string; dim: boolean }> | undefined;
}>;

export function paintTiles(tiles: readonly TilePaint[]): void {
  for (const tile of tiles) {
    const card = byId(cardId(tile.participantId));
    if (!card) continue;
    if (tile.focus) card.setAttribute('data-tile-focus', 'true');
    else card.removeAttribute('data-tile-focus');
    if (tile.action) card.setAttribute('data-tile-action', 'true');
    else card.removeAttribute('data-tile-action');
    const badge = card.querySelector<HTMLElement>(
      '[data-lab="replay-active-badge"]',
    );
    if (badge) {
      badge.textContent = tile.badge;
      badge.hidden = badge.textContent === '';
    }
    const veil = card.querySelector<HTMLDivElement>(
      '[data-lab="replay-visibility-overlay"]',
    );
    if (veil) {
      veil.hidden = tile.veil === undefined;
      if (tile.veil?.dim) veil.setAttribute('data-veil', 'dim');
      else veil.removeAttribute('data-veil');
      if (tile.veil) {
        veil.textContent = tile.veil.message;
        veil.setAttribute('aria-label', tile.veil.message);
      }
    }
  }
}

/* ── the page's own dialogs, the click marker ───────────────────────────── */

export function hideDialogOverlay(participantId: string): void {
  const overlay = byId(dialogId(participantId));
  if (overlay) overlay.hidden = true;
}

/** Shows what a replayed `alert`/`confirm`/`prompt` said. False without a frame. */
export function showDialogOverlay(
  participantId: string,
  dialog: ReplayDialogView,
): boolean {
  const overlay = byId(dialogId(participantId));
  if (!overlay) return false;
  const write = (lab: string, text: string) => {
    const target = overlay.querySelector<HTMLElement>(`[data-lab="${lab}"]`);
    if (target) target.textContent = text;
  };
  write('replay-dialog-title', dialog.title);
  write('replay-dialog-message', dialog.message);
  write('replay-dialog-result', dialog.result);
  overlay.hidden = false;
  return true;
}

export function hideClickMarker(participantId: string): void {
  const marker = byId(markerId(participantId));
  if (marker) marker.hidden = true;
}

/**
 * What the marker shows: a `click` gets the rings, a `press` (the pointer going
 * down, before the click) only the dot, a `hover` a small quiet dot.
 */
export type ClickMarkerKind = 'click' | 'press' | 'hover';

/** Plays the ping at a point of the replayed page, in this dashboard's pixels. */
export function showClickMarker(
  participantId: string,
  x: number,
  y: number,
  label: string,
  kind: ClickMarkerKind = 'click',
): void {
  const marker = byId(markerId(participantId));
  if (!marker) return;
  writeVars(marker, {
    ...assign(markerVars.x, unit.px(x)),
    ...assign(markerVars.y, unit.px(y)),
  });
  marker.setAttribute('aria-label', label);
  if (kind === 'hover') marker.setAttribute('data-marker-kind', 'hover');
  else marker.removeAttribute('data-marker-kind');
  for (const ring of marker.querySelectorAll<HTMLElement>(
    '[data-lab="click-marker-ripple"]',
  ))
    ring.hidden = kind !== 'click';
  marker.hidden = false;
  // A second click on the same spot plays the ping and its rings again.
  for (const ping of marker.getAnimations({ subtree: true })) {
    ping.cancel();
    ping.play();
  }
}

/* ── the stage ──────────────────────────────────────────────────────────── */

export type FrameLayout = Readonly<{
  participantId: string;
  /** The viewport the tab was recorded at, if any; read once the tile exists. */
  viewport: () => ReplayViewport | undefined;
}>;

let stageObserver: ResizeObserver | undefined;

/** Calls `onResize` now, and whenever the stage changes size. */
export function observeStage(onResize: () => void): void {
  const stage = byId(STAGE);
  if (!stage || typeof ResizeObserver === 'undefined') {
    onResize();
    return;
  }
  stageObserver?.disconnect();
  stageObserver = new ResizeObserver(onResize);
  stageObserver.observe(stage);
  onResize();
}

/**
 * Fits every tab's page to the room its tile has, scaling it around its centre.
 * Returns the scale each tab got, or nothing while there is no stage to measure.
 */
export function layoutFrames(
  layouts: readonly FrameLayout[],
): readonly Readonly<{ participantId: string; scale: number }>[] | undefined {
  const stage = byId(STAGE);
  if (!stage) return undefined;
  const scaled: Array<{ participantId: string; scale: number }> = [];
  for (const { participantId, viewport: viewportOf } of layouts) {
    const frame = frameFor(participantId);
    const viewportFrame = byId(wrapperId(participantId));
    const card = byId(cardId(participantId));
    if (!frame || !viewportFrame || !card) continue;
    const viewport = viewportOf();
    if (!viewport) {
      clearVars(viewportFrame, viewportVars.width, viewportVars.height);
      clearVars(
        frame,
        frameVars.width,
        frameVars.height,
        frameVars.scale,
        frameVars.shiftX,
        frameVars.shiftY,
      );
      continue;
    }

    const availableWidth = card.clientWidth;
    // What the tile and the grid keep for themselves around the page: the
    // title, the address, the gaps and the padding.
    const grid = byId(GRID);
    const gridStyle = grid ? getComputedStyle(grid) : undefined;
    const gridPadding = gridStyle
      ? Number.parseFloat(gridStyle.paddingTop) +
        Number.parseFloat(gridStyle.paddingBottom)
      : 0;
    const tileChrome = Math.max(
      0,
      card.offsetHeight - viewportFrame.offsetHeight,
    );
    const availableHeight = Math.max(
      180,
      stage.clientHeight - gridPadding - tileChrome,
    );
    if (availableWidth < 1 || availableHeight < 1) continue;
    const scale = Math.min(
      1,
      availableWidth / viewport.width,
      availableHeight / viewport.height,
    );
    writeVars(viewportFrame, {
      ...assign(viewportVars.width, unit.px(viewport.width * scale)),
      ...assign(viewportVars.height, unit.px(viewport.height * scale)),
    });
    // The page is scaled around its centre; the shift puts its corner back.
    writeVars(frame, {
      ...assign(frameVars.width, unit.px(viewport.width)),
      ...assign(frameVars.height, unit.px(viewport.height)),
      ...assign(frameVars.scale, num(scale)),
      ...assign(frameVars.shiftX, unit.px((-viewport.width * (1 - scale)) / 2)),
      ...assign(
        frameVars.shiftY,
        unit.px((-viewport.height * (1 - scale)) / 2),
      ),
    });
    scaled.push({ participantId, scale });
  }
  return scaled;
}
