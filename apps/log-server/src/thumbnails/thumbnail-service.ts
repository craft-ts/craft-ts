import { createHash } from 'node:crypto';
import type {
  DebugSessionStore,
  PortableDebugSession,
} from '../debug-session-store.js';
import {
  ThumbnailStore,
  type ThumbnailEntry,
  type ThumbnailManifest,
} from './thumbnail-store.js';

/** Bump when the pictures would differ for the same recording. */
export const THUMBNAIL_FORMAT_VERSION = 1;

/** What shapes the pictures; part of the cache key. */
export type ThumbnailParams = Readonly<{
  maxPoints: number;
  width: number;
  quality: number;
  quietMs: number;
  maxWaitMs: number;
}>;

export const DEFAULT_THUMBNAIL_PARAMS: ThumbnailParams = {
  maxPoints: 20,
  width: 480,
  quality: 0.7,
  quietMs: 400,
  maxWaitMs: 4_000,
};

/** A picture the worker took, with the moment it shows. */
export type CapturedFrame = Readonly<{
  replayIndex: number;
  participantId?: string;
  eventId?: string;
  sequence?: number;
  offsetMs: number;
  reasons: readonly string[];
  width: number;
  height: number;
  image: Uint8Array;
}>;

export type CaptureSink = Readonly<{
  /** The number of moments the worker will try to capture. */
  planned(total: number): void;
  frame(frame: CapturedFrame): void;
  /** A planned moment was handled without a new picture (same as the last). */
  skipped(): void;
  browser(version: string): void;
}>;

export type CaptureRequest = Readonly<{
  sessionId: string;
  params: ThumbnailParams;
  signal: AbortSignal;
}>;

/**
 * Takes the pictures of one recording. It replays the recording somewhere
 * invisible to the user and reports through the sink; it throws when it cannot
 * go on, after having reported what it had.
 */
export type ThumbnailCapturer = (
  request: CaptureRequest,
  sink: CaptureSink,
) => Promise<void>;

/** The replay stopped before its end; the pictures taken so far stay. */
export class ThumbnailCaptureError extends Error {
  readonly replayIndex: number | undefined;

  constructor(message: string, replayIndex?: number) {
    super(message);
    this.name = 'ThumbnailCaptureError';
    this.replayIndex = replayIndex;
  }
}

export type ThumbnailServiceOptions = Readonly<{
  store: ThumbnailStore;
  sessions: DebugSessionStore;
  /** Absent when no browser can be driven: every request answers `unavailable`. */
  capturer?: ThumbnailCapturer;
  unavailableReason?: string;
  params?: Partial<ThumbnailParams>;
  /** How many recordings are prepared at once. */
  concurrency?: number;
  /** Called after every manifest change; the HTTP layer does not need it. */
  onChange?: (manifest: ThumbnailManifest) => void;
}>;

type Job = {
  readonly sessionId: string;
  readonly key: string;
  readonly controller: AbortController;
  manifest: ThumbnailManifest;
  finished: Promise<void> | undefined;
};

export class ThumbnailService {
  private readonly params: ThumbnailParams;
  private readonly concurrency: number;
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private running = 0;

  private readonly options: ThumbnailServiceOptions;

  constructor(options: ThumbnailServiceOptions) {
    this.options = options;
    this.params = { ...DEFAULT_THUMBNAIL_PARAMS, ...options.params };
    this.concurrency = Math.max(1, options.concurrency ?? 1);
  }

  get available(): boolean {
    return this.options.capturer !== undefined;
  }

  /**
   * The state of a recording's pictures. Nothing is started here: the
   * manifest on disk is the answer, or the live one while a job runs.
   */
  get(sessionId: string): ThumbnailManifest | undefined {
    const job = this.jobs.get(sessionId);
    if (job) return job.manifest;
    const stored = this.options.store.readManifest(sessionId);
    // A job that was running when the server stopped is not running now.
    if (stored && (stored.status === 'running' || stored.status === 'pending'))
      return { ...stored, status: 'failed', error: 'Préparation interrompue.' };
    return stored;
  }

  /**
   * Starts preparing the pictures of a recording, unless the cache already
   * holds them for this very recording. `undefined`: no such recording.
   */
  start(
    sessionId: string,
    options: { force?: boolean } = {},
  ): ThumbnailManifest | undefined {
    const summary = this.options.sessions
      .list()
      .find((item) => item.id === sessionId);
    const session = summary
      ? this.options.sessions.get(sessionId)
      : undefined;
    if (!summary || !session) return undefined;

    const refusal = this.refusal(summary.status, session);
    if (refusal) return this.settle(sessionId, '', 'unavailable', refusal);

    const key = cacheKey(session, this.params);
    const live = this.jobs.get(sessionId);
    if (live && live.key === key) return live.manifest;
    if (live) this.cancel(sessionId);

    const stored = this.options.store.readManifest(sessionId);
    if (
      stored &&
      stored.key === key &&
      stored.status === 'ready' &&
      !options.force
    )
      return stored;

    // A failed run keeps its pictures; a retry or a changed recording starts over.
    this.options.store.clearImages(sessionId);
    const manifest = this.write({
      sessionId,
      key,
      status: 'pending',
      total: 0,
      done: 0,
      entries: [],
      updatedAt: new Date().toISOString(),
    });
    const job: Job = {
      sessionId,
      key,
      controller: new AbortController(),
      manifest,
      finished: undefined,
    };
    this.jobs.set(sessionId, job);
    this.queue.push(job);
    this.pump();
    return job.manifest;
  }

  /** One picture's bytes. */
  image(sessionId: string, file: string): Buffer | undefined {
    return this.options.store.readImage(sessionId, file);
  }

  /** Stops the preparation of a recording, if one runs, and forgets its pictures. */
  remove(sessionId: string): void {
    this.cancel(sessionId);
    this.options.store.remove(sessionId);
  }

  /** Forgets the pictures of the recordings the archive dropped. */
  prune(): void {
    const ids = new Set(this.options.sessions.list().map((item) => item.id));
    for (const sessionId of [...this.jobs.keys()])
      if (!ids.has(sessionId)) this.cancel(sessionId);
    this.options.store.pruneExcept(ids);
  }

  /** Ends every job and waits for the browsers to close. */
  async close(): Promise<void> {
    const pending = [...this.jobs.values()];
    for (const job of pending) job.controller.abort();
    this.queue.length = 0;
    await Promise.allSettled(pending.map((job) => job.finished));
  }

  private refusal(
    status: string,
    session: PortableDebugSession,
  ): string | undefined {
    if (!this.options.capturer)
      return (
        this.options.unavailableReason ??
        'Aucun navigateur pilotable : installe Playwright pour préparer les aperçus.'
      );
    if (status === 'recording')
      return 'Session en cours d’enregistrement : les aperçus se préparent à sa fin.';
    if (session.truncated)
      return 'Session tronquée : elle ne peut pas être rejouée en entier.';
    if (session.events.length === 0) return 'Session sans événement.';
    return undefined;
  }

  private cancel(sessionId: string): void {
    const job = this.jobs.get(sessionId);
    if (!job) return;
    job.controller.abort();
    const queued = this.queue.indexOf(job);
    if (queued >= 0) this.queue.splice(queued, 1);
    this.jobs.delete(sessionId);
  }

  private settle(
    sessionId: string,
    key: string,
    status: ThumbnailManifest['status'],
    error: string,
  ): ThumbnailManifest {
    const previous = this.options.store.readManifest(sessionId);
    return this.write({
      sessionId,
      key,
      status,
      total: previous?.total ?? 0,
      done: previous?.done ?? 0,
      entries: previous?.entries ?? [],
      error,
      updatedAt: new Date().toISOString(),
    });
  }

  private write(manifest: ThumbnailManifest): ThumbnailManifest {
    this.options.store.writeManifest(manifest);
    this.options.onChange?.(manifest);
    return manifest;
  }

  private pump(): void {
    while (this.running < this.concurrency) {
      const job = this.queue.shift();
      if (!job) return;
      if (job.controller.signal.aborted) continue;
      this.running += 1;
      job.finished = this.run(job).finally(() => {
        this.running -= 1;
        if (this.jobs.get(job.sessionId) === job)
          this.jobs.delete(job.sessionId);
        this.pump();
      });
    }
  }

  private async run(job: Job): Promise<void> {
    const { store, capturer } = this.options;
    if (!capturer) return;
    const update = (changes: Partial<ThumbnailManifest>): void => {
      // A job that was cancelled or replaced must not write over its successor.
      if (this.jobs.get(job.sessionId) !== job) return;
      job.manifest = this.write({
        ...job.manifest,
        ...changes,
        updatedAt: new Date().toISOString(),
      });
    };
    update({ status: 'running' });
    const sink: CaptureSink = {
      planned: (total) => update({ total }),
      browser: (browser) => update({ browser }),
      skipped: () => update({ done: job.manifest.done + 1 }),
      frame: (frame) => {
        if (this.jobs.get(job.sessionId) !== job) return;
        const index = job.manifest.entries.length;
        const file = `${String(index).padStart(3, '0')}.webp`;
        store.writeImage(job.sessionId, file, frame.image);
        const entry: ThumbnailEntry = {
          index,
          file,
          replayIndex: frame.replayIndex,
          ...(frame.participantId === undefined
            ? {}
            : { participantId: frame.participantId }),
          ...(frame.eventId === undefined ? {} : { eventId: frame.eventId }),
          ...(frame.sequence === undefined ? {} : { sequence: frame.sequence }),
          offsetMs: frame.offsetMs,
          reasons: frame.reasons,
          width: frame.width,
          height: frame.height,
          bytes: frame.image.byteLength,
        };
        update({
          entries: [...job.manifest.entries, entry],
          done: job.manifest.done + 1,
        });
      },
    };
    try {
      await capturer(
        {
          sessionId: job.sessionId,
          params: this.params,
          signal: job.controller.signal,
        },
        sink,
      );
      update({ status: 'ready' });
    } catch (error) {
      if (job.controller.signal.aborted) return;
      update({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof ThumbnailCaptureError &&
        error.replayIndex !== undefined
          ? { stoppedAtReplayIndex: error.replayIndex }
          : {}),
      });
    }
  }
}

/** The hash that names a recording's pictures: the recording plus the settings. */
export function cacheKey(
  session: PortableDebugSession,
  params: ThumbnailParams,
): string {
  const { exportedAt: _exportedAt, ...stable } = session;
  return createHash('sha256')
    .update(JSON.stringify([THUMBNAIL_FORMAT_VERSION, params, stable]))
    .digest('hex')
    .slice(0, 32);
}
