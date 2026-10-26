import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * A resume point frozen by the AI once the live app is where the recording
 * was: reopened without the AI while it is valid. It holds a test session's
 * storage (tokens included), so it stays on this machine, next to the
 * sessions and out of git.
 */
export type ResumeProbe = Readonly<{
  /** `GET /api/products/flat-white`; strings may use `{{state <address> <path>}}`. */
  method?: string;
  url: string;
  headers?: Readonly<Record<string, string>>;
  body?: unknown;
  expect: Readonly<{ status?: number; match?: readonly string[] }>;
}>;

export type ResumeCheckpoint = Readonly<{
  id: string;
  sessionId: string;
  beforeSequence?: number;
  label?: string;
  /** The app origin the point was taken on; it reopens only there. */
  origin: string;
  createdAt: string;
  /** Chosen by the AI, with its reason (« jeton expirant à 15 h 12 »). */
  expiresAt: string;
  ttlReason: string;
  /** The live app state at the freeze: a debug app snapshot. */
  snapshot: Readonly<Record<string, unknown>>;
  probes: readonly ResumeProbe[];
  created: readonly Readonly<{ kind: string; id: string; cleanup?: ResumeProbe }>[];
  deviations: readonly string[];
}>;

export type ResumeCheckpointSummary = Omit<ResumeCheckpoint, 'snapshot'> &
  Readonly<{ expired: boolean; route?: string }>;

/** What a listing shows: the point without its state, plus where it opens. */
export function summarizeCheckpoint(
  checkpoint: ResumeCheckpoint,
  now: Date,
): ResumeCheckpointSummary {
  const { snapshot, ...summary } = checkpoint;
  return {
    ...summary,
    ...(typeof snapshot['route'] === 'string' ? { route: snapshot['route'] } : {}),
    expired: Date.parse(checkpoint.expiresAt) <= now.getTime(),
  };
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ResumeCheckpointStore {
  readonly directory: string;
  readonly #now: () => Date;

  constructor(directory: string, now: () => Date = () => new Date()) {
    this.directory = directory;
    this.#now = now;
    mkdirSync(directory, { recursive: true });
  }

  save(input: Omit<ResumeCheckpoint, 'id' | 'createdAt'>): ResumeCheckpoint {
    const checkpoint: ResumeCheckpoint = {
      ...input,
      id: randomUUID(),
      createdAt: this.#now().toISOString(),
    };
    const path = this.#path(checkpoint.id);
    writeFileSync(`${path}.tmp`, JSON.stringify(checkpoint), 'utf8');
    renameSync(`${path}.tmp`, path);
    return checkpoint;
  }

  get(id: string): ResumeCheckpoint | undefined {
    if (!ID_PATTERN.test(id)) return undefined;
    const path = this.#path(id);
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as ResumeCheckpoint;
    } catch {
      return undefined;
    }
  }

  list(
    filter: Readonly<{ sessionId?: string; beforeSequence?: number }> = {},
  ): readonly ResumeCheckpointSummary[] {
    const now = this.#now();
    return readdirSync(this.directory)
      .filter((name) => name.endsWith('.json'))
      .flatMap((name) => {
        const checkpoint = this.get(name.slice(0, -'.json'.length));
        if (!checkpoint) return [];
        if (filter.sessionId !== undefined && checkpoint.sessionId !== filter.sessionId)
          return [];
        if (
          filter.beforeSequence !== undefined &&
          checkpoint.beforeSequence !== filter.beforeSequence
        )
          return [];
        return [summarizeCheckpoint(checkpoint, now)];
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  delete(id: string): boolean {
    if (!ID_PATTERN.test(id)) return false;
    const path = this.#path(id);
    if (!existsSync(path)) return false;
    rmSync(path);
    return true;
  }

  get storageBytes(): number {
    return readdirSync(this.directory).reduce(
      (total, name) => total + statSync(join(this.directory, name)).size,
      0,
    );
  }

  #path(id: string): string {
    return join(this.directory, `${id}.json`);
  }
}

export function parseResumeCheckpointInput(
  value: unknown,
  now: Date = new Date(),
): Omit<ResumeCheckpoint, 'id' | 'createdAt'> | string {
  if (!isRecord(value)) return 'A checkpoint is an object.';
  const sessionId = value['sessionId'];
  if (typeof sessionId !== 'string' || !ID_PATTERN.test(sessionId))
    return 'sessionId must be a session id.';
  const beforeSequence = value['beforeSequence'];
  if (
    beforeSequence !== undefined &&
    (typeof beforeSequence !== 'number' || !Number.isInteger(beforeSequence) || beforeSequence < 0)
  )
    return 'beforeSequence must be a non-negative integer.';
  const origin = value['origin'];
  if (typeof origin !== 'string' || !/^https?:\/\/[^/]+$/.test(origin))
    return 'origin must be an http(s) origin.';
  const expiresAt = value['expiresAt'];
  if (typeof expiresAt !== 'string' || !(Date.parse(expiresAt) > now.getTime()))
    return 'expiresAt must be a future ISO date.';
  const ttlReason = value['ttlReason'];
  if (typeof ttlReason !== 'string' || ttlReason.trim().length === 0)
    return 'ttlReason must say why the point expires then.';
  const snapshot = value['snapshot'];
  if (!isRecord(snapshot) || snapshot['format'] !== 'craft-debug-app-snapshot')
    return 'snapshot must be a debug app snapshot.';
  const probes = value['probes'] ?? [];
  if (!Array.isArray(probes) || !probes.every(isProbe))
    return 'probes must be { url, method?, headers?, body?, expect }.';
  const created = value['created'] ?? [];
  if (
    !Array.isArray(created) ||
    !created.every(
      (item) =>
        isRecord(item) &&
        typeof item['kind'] === 'string' &&
        typeof item['id'] === 'string' &&
        (item['cleanup'] === undefined || isProbe(item['cleanup'])),
    )
  )
    return 'created must be { kind, id, cleanup? }.';
  const deviations = value['deviations'] ?? [];
  if (!Array.isArray(deviations) || !deviations.every((item) => typeof item === 'string'))
    return 'deviations must be strings.';
  const label = value['label'];
  return {
    sessionId,
    ...(beforeSequence === undefined ? {} : { beforeSequence }),
    ...(typeof label === 'string' ? { label } : {}),
    origin,
    expiresAt: new Date(expiresAt).toISOString(),
    ttlReason,
    snapshot,
    probes: probes as ResumeProbe[],
    created: created as ResumeCheckpoint['created'][number][],
    deviations: deviations as string[],
  };
}

function isProbe(value: unknown): value is ResumeProbe {
  return (
    isRecord(value) &&
    typeof value['url'] === 'string' &&
    (value['method'] === undefined || typeof value['method'] === 'string') &&
    isRecord(value['expect'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
