/// <reference lib="dom" />
import {
  ThumbnailCaptureError,
  type CaptureRequest,
  type CaptureSink,
  type ThumbnailCapturer,
} from './thumbnail-service.js';

/**
 * Takes the pictures with a hidden Chromium driven by Playwright. It loads the
 * dashboard on the recording in worker mode (`?replay-worker=1`) and talks to
 * the stable control surface the dashboard installs there
 * (`window.__craftReplayWorker`), never to its buttons: the worker asks for the
 * capture plan, advances the replay to each moment, waits for the replayed page
 * to be still, and photographs that page's frame.
 *
 * Playwright is optional: it is loaded on first use, and its absence makes the
 * whole feature `unavailable` instead of breaking the server.
 */

export type PlaywrightCapturerOptions = Readonly<{
  /** Where the dashboard runs, e.g. `http://localhost:4210/`. */
  dashboardUrl: string;
  /** The module to load; overridable for tests. */
  loadPlaywright?: () => Promise<PlaywrightModule>;
  /** How long to wait for the replay to be ready, and for each step. */
  readyTimeoutMs?: number;
  stepTimeoutMs?: number;
}>;

/* The slice of Playwright this file uses, so that the server compiles without it. */
type Locator = {
  waitFor(options?: unknown): Promise<void>;
  isVisible(): Promise<boolean>;
  screenshot(options?: unknown): Promise<Buffer>;
  elementHandle(): Promise<ElementHandle | null>;
};
type ElementHandle = { contentFrame(): Promise<Frame | null> };
type Frame = {
  url(): string;
  evaluate<T, A = unknown>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T>;
};
type Page = {
  goto(url: string, options?: unknown): Promise<unknown>;
  evaluate<T, A = unknown>(fn: (arg: A) => T | Promise<T>, arg?: A): Promise<T>;
  waitForFunction<A>(
    fn: (arg: A) => unknown,
    arg?: A,
    options?: unknown,
  ): Promise<unknown>;
  locator(selector: string): Locator;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
};
type BrowserContext = { newPage(): Promise<Page> };
type Browser = {
  version(): string;
  newContext(options?: unknown): Promise<BrowserContext>;
  close(): Promise<void>;
};
export type PlaywrightModule = {
  chromium: { launch(options?: unknown): Promise<Browser> };
};

export async function loadPlaywright(): Promise<PlaywrightModule> {
  const name = 'playwright';
  return (await import(name)) as PlaywrightModule;
}

/** What the dashboard's worker surface answers; see `replay-worker.ts` there. */
type WorkerSnapshot = Readonly<{
  ready: boolean;
  failed: string | undefined;
  state: string;
  replayIndex: number;
  total: number;
  seeking: boolean;
  difference: boolean;
  scale: number;
  activeParticipantId: string | undefined;
  viewport: { width: number; height: number } | undefined;
}>;
type PlanPoint = Readonly<{
  replayIndex: number;
  reasons: readonly string[];
  participantId?: string;
  eventId?: string;
  sequence?: number;
  offsetMs: number;
}>;
type WorkerSurface = {
  snapshot(): WorkerSnapshot;
  plan(options: { maxPoints: number }): PlanPoint[];
  advanceTo(index: number): void;
};
type WorkerWindow = { __craftReplayWorker?: WorkerSurface };

/** How different two pictures may be to count as the same one, 0–255 per pixel. */
const SAME_PICTURE_DISTANCE = 3;
const SIGNATURE_SIDE = 24;

export function createPlaywrightCapturer(
  options: PlaywrightCapturerOptions,
): ThumbnailCapturer {
  const readyTimeoutMs = options.readyTimeoutMs ?? 60_000;
  const stepTimeoutMs = options.stepTimeoutMs ?? 45_000;
  return async (request, sink) => {
    let playwright: PlaywrightModule;
    try {
      playwright = await (options.loadPlaywright ?? loadPlaywright)();
    } catch (error) {
      throw new ThumbnailCaptureError(
        `Playwright est introuvable : installe-le pour préparer les aperçus (${message(error)}).`,
      );
    }
    const browser = await launch(playwright);
    const stop = () => void browser.close().catch(() => undefined);
    request.signal.addEventListener('abort', stop, { once: true });
    try {
      sink.browser(`chromium ${browser.version()}`);
      await capture(browser, request, sink, {
        dashboardUrl: options.dashboardUrl,
        readyTimeoutMs,
        stepTimeoutMs,
      });
    } finally {
      request.signal.removeEventListener('abort', stop);
      await browser.close().catch(() => undefined);
    }
  };
}

async function launch(playwright: PlaywrightModule): Promise<Browser> {
  try {
    return await playwright.chromium.launch({ headless: true });
  } catch (bundled) {
    // The bundled Chromium is not installed: the machine's Chrome does the same.
    try {
      return await playwright.chromium.launch({
        headless: true,
        channel: 'chrome',
      });
    } catch {
      throw new ThumbnailCaptureError(
        `Chromium introuvable pour Playwright (${message(bundled)}).`,
      );
    }
  }
}

async function capture(
  browser: Browser,
  request: CaptureRequest,
  sink: CaptureSink,
  settings: {
    dashboardUrl: string;
    readyTimeoutMs: number;
    stepTimeoutMs: number;
  },
): Promise<void> {
  const { params, sessionId, signal } = request;
  // One isolated context: nothing of the user's browser, and a profile of its own.
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1200 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const encoder = await context.newPage();
  const url = new URL(settings.dashboardUrl);
  url.searchParams.set('replay-worker', '1');
  url.hash = `#/sessions/${encodeURIComponent(sessionId)}`;
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });

  const first = await waitForSnapshot(
    page,
    (worker) => worker.ready || worker.failed !== undefined,
    settings.readyTimeoutMs,
    'le replay n’est pas prêt',
  );
  throwIfFailed(first, 0);
  const plan = await page.evaluate(
    (arg: { maxPoints: number }) =>
      (window as unknown as WorkerWindow).__craftReplayWorker!.plan(arg),
    { maxPoints: params.maxPoints },
  );
  sink.planned(plan.length);
  if (plan.length === 0) return;

  // The recorded viewport at scale 1: a bigger window, so the page is not shrunk.
  if (first.viewport) {
    await page.setViewportSize({
      width: Math.min(3840, first.viewport.width + 560),
      height: Math.min(2400, first.viewport.height + 480),
    });
    await waitForSnapshot(
      page,
      (worker) => worker.scale >= 0.99,
      4_000,
      'la page ne tient pas à l’échelle 1',
    ).catch(() => undefined);
  }

  let previousSignature: Uint8Array | undefined;
  for (const [position, point] of plan.entries()) {
    if (signal.aborted) return;
    const last = position === plan.length - 1;
    if (point.replayIndex > 0) {
      await page.evaluate(
        (index: number) =>
          (window as unknown as WorkerWindow).__craftReplayWorker!.advanceTo(
            index,
          ),
        point.replayIndex,
      );
    }
    const reached = await waitForSnapshot(
      page,
      (worker) =>
        worker.failed !== undefined ||
        worker.difference ||
        (worker.replayIndex >= point.replayIndex &&
          !worker.seeking &&
          ['ready', 'paused', 'completed'].includes(worker.state)),
      settings.stepTimeoutMs,
      'le replay n’avance plus',
    ).catch((error: unknown) => {
      throw new ThumbnailCaptureError(message(error), point.replayIndex);
    });
    throwIfFailed(reached, point.replayIndex);
    if (reached.difference)
      throw new ThumbnailCaptureError(
        'Le replay a divergé de l’enregistrement.',
        point.replayIndex,
      );

    const participantId = point.participantId ?? reached.activeParticipantId;
    const frameLocator = page.locator(
      participantId
        ? `iframe[data-replay-participant="${cssEscape(participantId)}"]`
        : 'iframe[data-replay-participant]',
    );
    if (!(await frameLocator.isVisible())) {
      sink.skipped();
      continue;
    }
    await settleFrame(frameLocator, params.quietMs, params.maxWaitMs);
    if (signal.aborted) return;
    const png = await frameLocator.screenshot({ type: 'png', animations: 'disabled' });
    const encoded = await encode(encoder, png, params.width, params.quality);
    const signature = Uint8Array.from(encoded.signature);
    const identical =
      previousSignature !== undefined &&
      distance(previousSignature, signature) <= SAME_PICTURE_DISTANCE;
    if (identical && !last) {
      sink.skipped();
      continue;
    }
    previousSignature = signature;
    sink.frame({
      replayIndex: point.replayIndex,
      ...(participantId === undefined ? {} : { participantId }),
      ...(point.eventId === undefined ? {} : { eventId: point.eventId }),
      ...(point.sequence === undefined ? {} : { sequence: point.sequence }),
      offsetMs: point.offsetMs,
      reasons: point.reasons,
      width: encoded.width,
      height: encoded.height,
      image: Buffer.from(encoded.base64, 'base64'),
    });
  }
}

function throwIfFailed(snapshot: WorkerSnapshot, replayIndex: number): void {
  if (snapshot.failed !== undefined)
    throw new ThumbnailCaptureError(snapshot.failed, replayIndex);
}

async function waitForSnapshot(
  page: Page,
  accept: (snapshot: WorkerSnapshot) => boolean,
  timeout: number,
  reason: string,
): Promise<WorkerSnapshot> {
  const source = accept.toString();
  try {
    await page.waitForFunction(
      (code: string) => {
        const worker = (window as unknown as WorkerWindow).__craftReplayWorker;
        if (!worker) return false;
        // eslint-disable-next-line no-new-func
        return (new Function(`return (${code})`)() as (s: unknown) => boolean)(
          worker.snapshot(),
        );
      },
      source,
      { timeout, polling: 100 },
    );
  } catch (error) {
    throw new ThumbnailCaptureError(`${reason} (${message(error)}).`);
  }
  return page.evaluate(
    () => (window as unknown as WorkerWindow).__craftReplayWorker!.snapshot(),
  );
}

/** Waits until the replayed page stops mutating, or gives up after `maxWaitMs`. */
async function settleFrame(
  iframe: Locator,
  quietMs: number,
  maxWaitMs: number,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const handle = await iframe.elementHandle();
      const frame = await handle?.contentFrame();
      if (!frame) return;
      await frame.evaluate(
        ({ quiet, max }: { quiet: number; max: number }) =>
          new Promise<void>((resolve) => {
            const startedAt = performance.now();
            let lastMutation = startedAt;
            const observer = new MutationObserver(() => {
              lastMutation = performance.now();
            });
            observer.observe(document, {
              subtree: true,
              childList: true,
              attributes: true,
              characterData: true,
            });
            const tick = (): void => {
              const now = performance.now();
              if (
                document.readyState === 'complete' &&
                now - lastMutation >= quiet
              ) {
                observer.disconnect();
                resolve();
              } else if (now - startedAt >= max) {
                observer.disconnect();
                resolve();
              } else {
                setTimeout(tick, 50);
              }
            };
            tick();
          }),
        { quiet: quietMs, max: maxWaitMs },
      );
      return;
    } catch {
      // The page navigated under us: look again at the new document.
    }
  }
}

type Encoded = Readonly<{
  base64: string;
  width: number;
  height: number;
  signature: number[];
}>;

/** PNG → WebP at the thumbnail width, plus a tiny grayscale signature. */
async function encode(
  encoder: Page,
  png: Buffer,
  width: number,
  quality: number,
): Promise<Encoded> {
  return encoder.evaluate(
    async (arg: {
      png: string;
      width: number;
      quality: number;
      side: number;
    }): Promise<Encoded> => {
      const bytes = Uint8Array.from(atob(arg.png), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes]));
      const outWidth = Math.min(arg.width, bitmap.width);
      const outHeight = Math.max(
        1,
        Math.round((bitmap.height * outWidth) / bitmap.width),
      );
      const canvas = new OffscreenCanvas(outWidth, outHeight);
      const context = canvas.getContext('2d')!;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, outWidth, outHeight);
      const blob = await canvas.convertToBlob({
        type: 'image/webp',
        quality: arg.quality,
      });
      const small = new OffscreenCanvas(arg.side, arg.side);
      const smallContext = small.getContext('2d')!;
      smallContext.drawImage(bitmap, 0, 0, arg.side, arg.side);
      const pixels = smallContext.getImageData(0, 0, arg.side, arg.side).data;
      const signature: number[] = [];
      for (let i = 0; i < pixels.length; i += 4)
        signature.push(
          Math.round(
            0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!,
          ),
        );
      const buffer = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < buffer.length; i += 0x8000)
        binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
      bitmap.close();
      return {
        base64: btoa(binary),
        width: outWidth,
        height: outHeight,
        signature,
      };
    },
    {
      png: png.toString('base64'),
      width,
      quality,
      side: SIGNATURE_SIDE,
    },
  );
}

/** Mean absolute difference between two signatures. */
function distance(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i]! - b[i]!);
  return total / a.length;
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

function message(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0]! : String(error);
}
