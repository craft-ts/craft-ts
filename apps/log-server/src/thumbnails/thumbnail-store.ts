import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export type ThumbnailJobStatus =
  | 'pending'
  | 'running'
  | 'ready'
  | 'failed'
  /** The recording cannot be prepared (still recording, truncated, no worker). */
  | 'unavailable';

export type ThumbnailEntry = Readonly<{
  /** Position in the strip; names the image file. */
  index: number;
  file: string;
  /** Actions that had run when the picture was taken (0 = the app as it opens). */
  replayIndex: number;
  participantId?: string;
  eventId?: string;
  sequence?: number;
  /** Recorded time of the moment, from the first action. */
  offsetMs: number;
  reasons: readonly string[];
  width: number;
  height: number;
  bytes: number;
}>;

export type ThumbnailManifest = Readonly<{
  sessionId: string;
  /** Hash of the recording and of everything that changes the pictures. */
  key: string;
  status: ThumbnailJobStatus;
  /** Pictures planned for the recording, once the plan is known. */
  total: number;
  /** Planned moments already handled (taken or judged identical to the last). */
  done: number;
  entries: readonly ThumbnailEntry[];
  /** Why the job failed or cannot run, in a few words. */
  error?: string;
  /** Where the replay stopped when it did not reach the end. */
  stoppedAtReplayIndex?: number;
  browser?: string;
  updatedAt: string;
}>;

const SESSION_ID = /^[0-9a-f-]{36}$/i;
const IMAGE_FILE = /^\d{3,5}\.webp$/;

/** The pictures of each recording and the manifest that describes them. */
export class ThumbnailStore {
  readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true });
  }

  readManifest(sessionId: string): ThumbnailManifest | undefined {
    try {
      const parsed: unknown = JSON.parse(
        readFileSync(this.manifestPath(sessionId), 'utf8'),
      );
      return isManifest(parsed, sessionId) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  writeManifest(manifest: ThumbnailManifest): void {
    const folder = this.folder(manifest.sessionId);
    mkdirSync(folder, { recursive: true });
    const target = this.manifestPath(manifest.sessionId);
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, JSON.stringify(manifest));
    renameSync(temporary, target);
  }

  writeImage(sessionId: string, file: string, bytes: Uint8Array): void {
    if (!IMAGE_FILE.test(file)) throw new Error(`Invalid image name: ${file}`);
    const folder = this.folder(sessionId);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, file), bytes);
  }

  /** The bytes of one picture, or nothing when the name is not a picture. */
  readImage(sessionId: string, file: string): Buffer | undefined {
    if (!IMAGE_FILE.test(file)) return undefined;
    try {
      return readFileSync(join(this.folder(sessionId), file));
    } catch {
      return undefined;
    }
  }

  /** Forgets the pictures; the manifest goes with them. */
  clearImages(sessionId: string): void {
    rmSync(this.folder(sessionId), { recursive: true, force: true });
  }

  remove(sessionId: string): void {
    this.clearImages(sessionId);
  }

  /** Removes the caches of recordings the archive no longer holds. */
  pruneExcept(sessionIds: ReadonlySet<string>): void {
    let names: string[];
    try {
      names = readdirSync(this.directory);
    } catch {
      return;
    }
    for (const name of names)
      if (SESSION_ID.test(name) && !sessionIds.has(name))
        rmSync(join(this.directory, name), { recursive: true, force: true });
  }

  private folder(sessionId: string): string {
    if (!SESSION_ID.test(sessionId))
      throw new Error(`Invalid session id: ${sessionId}`);
    return join(this.directory, sessionId);
  }

  private manifestPath(sessionId: string): string {
    return join(this.folder(sessionId), 'manifest.json');
  }
}

function isManifest(
  value: unknown,
  sessionId: string,
): value is ThumbnailManifest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { sessionId?: unknown }).sessionId === sessionId &&
    typeof (value as { key?: unknown }).key === 'string' &&
    typeof (value as { status?: unknown }).status === 'string' &&
    Array.isArray((value as { entries?: unknown }).entries)
  );
}
