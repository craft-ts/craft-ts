import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export type StoredDebugSessionStatus =
  | 'recording'
  | 'completed'
  | 'interrupted';

export type StoredEnvironmentProfile = Readonly<{
  browser?: string;
  browserVersion?: string;
  engine?: 'chromium' | 'gecko' | 'webkit' | 'unknown';
  platform?: string;
  userAgent?: string;
  viewport?: Readonly<{ width: number; height: number }>;
  devicePixelRatio?: number;
  language?: string;
  languages?: readonly string[];
  timeZone?: string;
  screen?: Readonly<{ width: number; height: number }>;
}>;

export type StoredDebugSessionSummary = Readonly<{
  id: string;
  startUrl: string;
  createdAt: string;
  updatedAt: string;
  status: StoredDebugSessionStatus;
  version: 2;
  eventCount: number;
  truncated: boolean;
  participantCount: number;
}>;

export type StoredDebugSessionParticipant = Readonly<{
  id: string;
  title: string;
  startUrl: string;
  viewport?: Readonly<{ width: number; height: number }>;
  environment?: StoredEnvironmentProfile;
  state: 'visible' | 'hidden' | 'blurred';
  status: 'recording' | 'completed' | 'interrupted';
  createdAt: string;
  updatedAt: string;
  initialSnapshot?: Readonly<Record<string, unknown>>;
}>;

type StoredSession = Omit<StoredDebugSessionSummary, 'participantCount'> & {
  endedAt?: string;
  viewport?: Readonly<{ width: number; height: number }>;
  environment?: StoredEnvironmentProfile;
  initialSnapshot?: Readonly<Record<string, unknown>>;
  clips: readonly unknown[];
  participants: readonly StoredDebugSessionParticipant[];
};

export type PortableDebugSession = Readonly<{
  format: 'craft-debug-session';
  version: 2;
  startUrl: string;
  viewport?: Readonly<{ width: number; height: number }>;
  exportedAt: number;
  truncated: boolean;
  events: readonly Record<string, unknown>[];
  clips: readonly unknown[];
  initialSnapshot?: Readonly<Record<string, unknown>>;
  participants?: readonly StoredDebugSessionParticipant[];
  environment?: StoredEnvironmentProfile;
}>;

const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_RECONNECT_GRACE_MS = 5_000;

export type DebugSessionStoreOptions = Readonly<{
  maxSessions?: number;
  maxAgeMs?: number;
  reconnectGraceMs?: number;
}>;

/** Persists each live session as append-only events plus a small JSON index. */
export class DebugSessionStore {
  readonly directory: string;
  private readonly indexPath: string;
  private readonly sessions = new Map<string, StoredSession>();
  private readonly sessionRedirects = new Map<string, string>();
  private readonly liveEvents = new Map<string, Record<string, unknown>[]>();
  private readonly eventKeys = new Map<string, Set<string>>();
  private readonly nextEventSequence = new Map<string, number>();
  private readonly finishTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly maxSessions: number;
  private readonly maxAgeMs: number;
  private readonly reconnectGraceMs: number;

  constructor(directory: string, options: DebugSessionStoreOptions = {}) {
    this.directory = directory;
    this.indexPath = join(directory, 'index.json');
    this.maxSessions = positiveInteger(
      options.maxSessions,
      DEFAULT_MAX_SESSIONS,
    );
    this.maxAgeMs = positiveInteger(options.maxAgeMs, DEFAULT_MAX_AGE_MS);
    this.reconnectGraceMs = positiveInteger(
      options.reconnectGraceMs,
      DEFAULT_RECONNECT_GRACE_MS,
    );
    mkdirSync(directory, { recursive: true });
    this.loadIndex();
    this.prune();
  }

  list(): readonly StoredDebugSessionSummary[] {
    return [...this.sessions.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(
        ({
          id,
          startUrl,
          createdAt,
          updatedAt,
          status,
          version,
          eventCount,
          truncated,
          participants,
        }) => ({
          id,
          startUrl,
          createdAt,
          updatedAt,
          status,
          version,
          eventCount,
          truncated,
          participantCount: participants.length,
        }),
      );
  }

  begin(
    id: string,
    session: PortableDebugSession,
    createdAt: string,
    participantId = 'default',
    participant: Partial<StoredDebugSessionParticipant> = {},
  ): string {
    assertSessionId(id);
    assertPortableSession(session);
    assertParticipantId(participantId);
    const now = new Date().toISOString();
    const redirectedId = this.sessionRedirects.get(id);
    const previous = this.sessions.get(redirectedId ?? id);
    let effectiveId = redirectedId ?? id;
    if (previous && previous.status !== 'recording') {
      effectiveId = randomUUID();
      this.sessionRedirects.set(id, effectiveId);
    }
    const pendingFinish = this.finishTimers.get(effectiveId);
    if (pendingFinish !== undefined) clearTimeout(pendingFinish);
    this.finishTimers.delete(effectiveId);
    const current = this.sessions.get(effectiveId);
    const incomingEvents = session.events.filter(
      (event) => !isInitialSnapshot(event),
    );
    const previousEvents = current
      ? (this.liveEvents.get(effectiveId) ?? this.readEvents(effectiveId))
      : [];
    const known =
      this.eventKeys.get(effectiveId) ??
      new Set(
        previousEvents.map(
          (event) =>
            `${event['participantId'] ?? 'default'}:${event['participantSequence'] ?? event['sequence']}`,
        ),
      );
    let nextSequence =
      this.nextEventSequence.get(effectiveId) ??
      previousEvents.reduce(
        (highest, event) => Math.max(highest, Number(event['sequence']) || 0),
        0,
      );
    const additions = incomingEvents.flatMap((event) => {
      const participantSequence = Number(event['sequence']);
      const key = `${participantId}:${participantSequence}`;
      if (known.has(key)) return [];
      known.add(key);
      nextSequence += 1;
      return [
        {
          ...event,
          sequence: nextSequence,
          participantId,
          participantSequence,
          globalElapsedMs: Math.max(
            0,
            Number(event['timestamp']) -
              Date.parse(current?.createdAt ?? createdAt),
          ),
        },
      ];
    });
    const events = [...previousEvents, ...additions];
    const initialSnapshot =
      session.initialSnapshot ?? findInitialSnapshot(session.events);
    const participantRecord: StoredDebugSessionParticipant = {
      id: participantId,
      title: boundedText(participant.title, 200) ?? session.startUrl,
      startUrl: session.startUrl,
      ...(session.viewport ? { viewport: session.viewport } : {}),
      ...(isEnvironmentProfile(participant.environment)
        ? { environment: participant.environment }
        : {}),
      ...(initialSnapshot ? { initialSnapshot } : {}),
      state: participant.state ?? 'visible',
      status: 'recording',
      createdAt: participant.createdAt ?? now,
      updatedAt: now,
    };
    const participants = mergeParticipant(
      current?.participants ?? [],
      participantRecord,
    );
    const incomingClips = session.clips.map((clip) =>
      isRecord(clip) ? { ...clip, participantId } : clip,
    );
    const clips = mergeClips(
      current?.clips ?? [],
      incomingClips,
      participantId,
    );
    const stored: StoredSession = {
      ...(current ?? {}),
      id: effectiveId,
      startUrl: current?.startUrl ?? session.startUrl,
      createdAt:
        current?.createdAt ?? (validIsoDate(createdAt) ? createdAt : now),
      updatedAt: now,
      status: 'recording',
      version: 2,
      eventCount: events.length,
      truncated: Boolean(current?.truncated) || session.truncated,
      clips,
      participants,
      ...((current?.viewport ?? session.viewport)
        ? { viewport: current?.viewport ?? session.viewport }
        : {}),
      ...((current?.initialSnapshot ?? initialSnapshot)
        ? { initialSnapshot: current?.initialSnapshot ?? initialSnapshot }
        : {}),
    };
    if (!current || additions.length > 0) this.writeEvents(effectiveId, events);
    this.liveEvents.set(effectiveId, events);
    this.eventKeys.set(effectiveId, known);
    this.nextEventSequence.set(effectiveId, nextSequence);
    this.sessions.set(effectiveId, stored);
    this.prune();
    this.persistIndex();
    return effectiveId;
  }

  append(
    id: string,
    event: Record<string, unknown>,
    clips: readonly unknown[],
    truncated: boolean,
    participantId = 'default',
  ): void {
    this.appendBatch(id, [event], clips, truncated, participantId);
  }

  appendBatch(
    id: string,
    incoming: readonly Record<string, unknown>[],
    clips: readonly unknown[],
    truncated: boolean,
    participantId = 'default',
  ): void {
    assertSessionId(id);
    const current = this.sessions.get(id);
    if (!current || current.status !== 'recording') return;
    assertParticipantId(participantId);

    const now = new Date().toISOString();
    const previousEvents = this.liveEvents.get(id) ?? this.readEvents(id);
    const eventKeys =
      this.eventKeys.get(id) ??
      new Set(
        previousEvents.map(
          (item) =>
            `${item['participantId'] ?? 'default'}:${item['participantSequence'] ?? item['sequence']}`,
        ),
      );
    let nextSequence =
      this.nextEventSequence.get(id) ??
      previousEvents.reduce(
        (highest, item) => Math.max(highest, Number(item['sequence']) || 0),
        0,
      );
    let initialSnapshot = current.initialSnapshot;
    const additions = incoming.flatMap((event) => {
      if (!isSessionEvent(event)) return [];
      if (isInitialSnapshot(event)) {
        if (isRecord(event['state'])) initialSnapshot = event['state'];
        return [];
      }
      const participantSequence = Number(event['sequence']);
      const eventKey = `${participantId}:${participantSequence}`;
      if (eventKeys.has(eventKey)) return [];
      eventKeys.add(eventKey);
      nextSequence += 1;
      return [
        {
          ...event,
          sequence: nextSequence,
          participantId,
          participantSequence,
          globalElapsedMs: Math.max(
            0,
            Number(event['timestamp']) - Date.parse(current.createdAt),
          ),
        },
      ];
    });
    if (additions.length > 0) {
      appendFileSync(
        this.eventsPath(id),
        `${additions.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );
      previousEvents.push(...additions);
    }
    this.liveEvents.set(id, previousEvents);
    this.eventKeys.set(id, eventKeys);
    this.nextEventSequence.set(id, nextSequence);
    this.sessions.set(id, {
      ...current,
      clips: mergeClips(current.clips, clips, participantId),
      updatedAt: now,
      eventCount: previousEvents.length,
      truncated: current.truncated || truncated,
      ...(initialSnapshot ? { initialSnapshot } : {}),
    });
    this.updateParticipant(id, participantId, {
      updatedAt: now,
      status: 'recording',
    });
    if (
      additions.length > 0 ||
      initialSnapshot !== current.initialSnapshot ||
      clips.length > 0
    )
      this.scheduleIndexPersistence();
  }

  updateParticipantState(
    id: string,
    participantId: string,
    state: StoredDebugSessionParticipant['state'],
  ): void {
    const current = this.sessions.get(id);
    if (!current) return;
    this.updateParticipant(id, participantId, {
      state,
      updatedAt: new Date().toISOString(),
    });
    this.scheduleIndexPersistence();
  }

  hasParticipant(id: string, participantId: string): boolean {
    return Boolean(
      this.sessions
        .get(id)
        ?.participants.some((item) => item.id === participantId),
    );
  }

  finishParticipant(
    id: string,
    participantId: string,
    status: 'completed' | 'interrupted',
  ): StoredDebugSessionStatus | undefined {
    const current = this.sessions.get(id);
    if (
      !current ||
      !current.participants.some((item) => item.id === participantId)
    )
      return undefined;
    const now = new Date().toISOString();
    const participants = current.participants.map((participant) => {
      if (participant.id !== participantId) return participant;
      // A confirmed keepalive finish must not be downgraded by a late WS close.
      if (participant.status === 'completed' && status === 'interrupted')
        return participant;
      return { ...participant, status, updatedAt: now };
    });
    const stillRecording = participants.some(
      (participant) => participant.status === 'recording',
    );
    const next = {
      ...current,
      participants,
      // Keep a short reconnect window so a page reload rejoins this session.
      status: 'recording' as const,
      updatedAt: now,
    } satisfies StoredSession;
    this.sessions.set(id, next);
    if (!stillRecording) {
      const timer = setTimeout(() => {
        this.finishTimers.delete(id);
        const latest = this.sessions.get(id);
        if (!latest || latest.status !== 'recording') return;
        const finalStatus: StoredDebugSessionStatus = latest.participants.some(
          (participant) => participant.status === 'recording',
        )
          ? 'recording'
          : latest.participants.some(
                (participant) => participant.status === 'interrupted',
              )
            ? 'interrupted'
            : 'completed';
        const endedAt = new Date().toISOString();
        this.sessions.set(id, {
          ...latest,
          status: finalStatus,
          updatedAt: endedAt,
          endedAt,
        });
        this.liveEvents.delete(id);
        this.eventKeys.delete(id);
        this.nextEventSequence.delete(id);
        this.persistIndex();
      }, this.reconnectGraceMs);
      timer.unref?.();
      this.finishTimers.set(id, timer);
    }
    this.persistIndex();
    return 'recording';
  }

  finish(id: string, status: 'completed' | 'interrupted'): void {
    assertSessionId(id);
    const current = this.sessions.get(id);
    if (!current || current.status !== 'recording') return;
    const now = new Date().toISOString();
    this.sessions.set(id, {
      ...current,
      status,
      participants: current.participants.map((participant) => ({
        ...participant,
        status,
        updatedAt: now,
      })),
      endedAt: now,
      updatedAt: now,
    });
    this.liveEvents.delete(id);
    this.eventKeys.delete(id);
    this.nextEventSequence.delete(id);
    this.persistIndex();
  }

  delete(id: string): boolean {
    assertSessionId(id);
    if (!this.sessions.has(id)) return false;
    this.sessions.delete(id);
    this.liveEvents.delete(id);
    this.eventKeys.delete(id);
    this.nextEventSequence.delete(id);
    rmSync(this.eventsPath(id), { force: true });
    this.persistIndex();
    return true;
  }

  private indexFlushTimer: ReturnType<typeof setTimeout> | undefined;

  close(): void {
    if (this.indexFlushTimer !== undefined) clearTimeout(this.indexFlushTimer);
    this.indexFlushTimer = undefined;
    for (const timer of this.finishTimers.values()) clearTimeout(timer);
    this.finishTimers.clear();
    this.persistIndex();
  }

  get(id: string): PortableDebugSession | undefined {
    assertSessionId(id);
    const stored = this.sessions.get(id);
    if (!stored) return undefined;
    const rawEvents = this.readEvents(id);
    const events = rawEvents.filter((event) => !isInitialSnapshot(event));
    const initialSnapshot =
      stored.initialSnapshot ?? findInitialSnapshot(rawEvents);
    const eventIds = new Set(events.map((event) => event['id']));
    const clips = stored.clips.map((clip) => {
      if (!isRecord(clip) || !Array.isArray(clip['eventIds'])) return clip;
      return {
        ...clip,
        eventIds: clip['eventIds'].filter(
          (eventId) => typeof eventId === 'string' && eventIds.has(eventId),
        ),
      };
    });
    return {
      format: 'craft-debug-session',
      version: 2,
      startUrl: stored.startUrl,
      ...(stored.viewport ? { viewport: stored.viewport } : {}),
      exportedAt: Date.parse(stored.updatedAt),
      truncated: stored.truncated,
      events,
      clips,
      ...(initialSnapshot ? { initialSnapshot } : {}),
      participants: stored.participants,
    };
  }

  private loadIndex(): void {
    if (!existsSync(this.indexPath)) return;
    try {
      const value: unknown = JSON.parse(readFileSync(this.indexPath, 'utf8'));
      if (!Array.isArray(value)) return;
      for (const entry of value) {
        if (!isStoredSession(entry) || !existsSync(this.eventsPath(entry.id)))
          continue;
        const interruptedAt = new Date().toISOString();
        const session =
          entry.status === 'recording'
            ? {
                ...entry,
                status: 'interrupted' as const,
                updatedAt: interruptedAt,
                participants: (Array.isArray(entry.participants)
                  ? entry.participants
                  : []
                ).map((participant) => ({
                  ...participant,
                  status: 'interrupted' as const,
                  updatedAt: interruptedAt,
                })),
              }
            : entry;
        const normalizedSession = {
          ...session,
          participants: Array.isArray(session.participants)
            ? session.participants
            : [],
        };
        this.sessions.set(session.id, normalizedSession);
        const events = this.readEvents(session.id);
        this.eventKeys.set(
          session.id,
          new Set(
            events.map(
              (event) =>
                `${event['participantId'] ?? 'default'}:${event['participantSequence'] ?? event['sequence']}`,
            ),
          ),
        );
        this.nextEventSequence.set(
          session.id,
          events.reduce(
            (highest, event) =>
              Math.max(highest, Number(event['sequence']) || 0),
            0,
          ),
        );
        const eventCount = events.filter(
          (event) => !isInitialSnapshot(event),
        ).length;
        if (eventCount !== normalizedSession.eventCount) {
          this.sessions.set(session.id, { ...normalizedSession, eventCount });
        }
      }
      this.persistIndex();
    } catch {
      // A damaged index must not prevent the local log server from starting.
    }
  }

  private eventsPath(id: string): string {
    return join(this.directory, `${id}.events.jsonl`);
  }

  private readEvents(id: string): Record<string, unknown>[] {
    try {
      return readFileSync(this.eventsPath(id), 'utf8')
        .split('\n')
        .filter(Boolean)
        .flatMap((line) => {
          try {
            const value: unknown = JSON.parse(line);
            return isRecord(value) ? [value] : [];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  }

  private writeEvents(
    id: string,
    events: readonly Record<string, unknown>[],
  ): void {
    writeFileSync(
      this.eventsPath(id),
      events.map((event) => JSON.stringify(event)).join('\n') +
        (events.length ? '\n' : ''),
      'utf8',
    );
  }

  private persistIndex(): void {
    if (this.indexFlushTimer !== undefined) clearTimeout(this.indexFlushTimer);
    this.indexFlushTimer = undefined;
    const temporaryPath = `${this.indexPath}.tmp`;
    writeFileSync(
      temporaryPath,
      JSON.stringify([...this.sessions.values()], null, 2),
      'utf8',
    );
    renameSync(temporaryPath, this.indexPath);
  }

  private scheduleIndexPersistence(): void {
    if (this.indexFlushTimer !== undefined) return;
    this.indexFlushTimer = setTimeout(() => {
      this.indexFlushTimer = undefined;
      this.persistIndex();
    }, 250);
    this.indexFlushTimer.unref?.();
  }

  private updateParticipant(
    id: string,
    participantId: string,
    update: Partial<StoredDebugSessionParticipant>,
  ): void {
    const current = this.sessions.get(id);
    if (!current) return;
    const existing = current.participants.find(
      (participant) => participant.id === participantId,
    );
    if (!existing) return;
    this.sessions.set(id, {
      ...current,
      participants: current.participants.map((participant) =>
        participant.id === participantId
          ? { ...participant, ...update }
          : participant,
      ),
    });
  }

  private prune(): void {
    const sessions = [...this.sessions.values()].sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        b.createdAt.localeCompare(a.createdAt),
    );
    const cutoff = Date.now() - this.maxAgeMs;
    const keep = new Set(
      sessions.slice(0, this.maxSessions).map((item) => item.id),
    );
    let changed = false;
    for (const stored of sessions) {
      if (Date.parse(stored.createdAt) < cutoff || !keep.has(stored.id)) {
        this.sessions.delete(stored.id);
        this.liveEvents.delete(stored.id);
        this.eventKeys.delete(stored.id);
        this.nextEventSequence.delete(stored.id);
        rmSync(this.eventsPath(stored.id), { force: true });
        changed = true;
      }
    }
    if (changed) this.persistIndex();
  }
}

function assertSessionId(id: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new Error('Invalid session id.');
}

function assertParticipantId(id: string): void {
  if (!id || id.length > 200)
    throw new Error('Invalid session participant id.');
}

function assertPortableSession(
  value: unknown,
): asserts value is PortableDebugSession {
  if (
    !isRecord(value) ||
    value['format'] !== 'craft-debug-session' ||
    value['version'] !== 2 ||
    typeof value['startUrl'] !== 'string' ||
    (value['viewport'] !== undefined && !isValidViewport(value['viewport'])) ||
    !Array.isArray(value['events']) ||
    !Array.isArray(value['clips']) ||
    typeof value['truncated'] !== 'boolean'
  ) {
    throw new Error('Invalid Craft debug session snapshot.');
  }
}

function isStoredSession(value: unknown): value is StoredSession {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['startUrl'] === 'string' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    ['recording', 'completed', 'interrupted'].includes(
      String(value['status']),
    ) &&
    value['version'] === 2 &&
    (value['viewport'] === undefined || isValidViewport(value['viewport'])) &&
    typeof value['eventCount'] === 'number' &&
    typeof value['truncated'] === 'boolean' &&
    Array.isArray(value['clips']) &&
    (value['participants'] === undefined ||
      Array.isArray(value['participants']))
  );
}

function mergeParticipant(
  current: readonly StoredDebugSessionParticipant[],
  incoming: StoredDebugSessionParticipant,
): StoredDebugSessionParticipant[] {
  const existing = current.find(
    (participant) => participant.id === incoming.id,
  );
  if (!existing) return [...current, incoming];
  return current.map((participant) =>
    participant.id === incoming.id
      ? {
          ...existing,
          ...incoming,
          createdAt: existing.createdAt,
          initialSnapshot: incoming.initialSnapshot ?? existing.initialSnapshot,
        }
      : participant,
  );
}

function isEnvironmentProfile(
  value: unknown,
): value is StoredEnvironmentProfile {
  return (
    isRecord(value) &&
    (value['browser'] === undefined || typeof value['browser'] === 'string') &&
    (value['browserVersion'] === undefined ||
      typeof value['browserVersion'] === 'string') &&
    (value['engine'] === undefined ||
      ['chromium', 'gecko', 'webkit', 'unknown'].includes(
        String(value['engine']),
      )) &&
    (value['userAgent'] === undefined ||
      (typeof value['userAgent'] === 'string' &&
        value['userAgent'].length <= 2_000))
  );
}

function mergeClips(
  current: readonly unknown[],
  incoming: readonly unknown[],
  participantId: string,
): readonly unknown[] {
  const merged = new Map<string, unknown>();
  for (const clip of current) {
    if (!isRecord(clip) || typeof clip['id'] !== 'string') continue;
    const owner =
      typeof clip['participantId'] === 'string'
        ? clip['participantId']
        : 'default';
    merged.set(`${owner}:${clip['id']}`, clip);
  }
  for (const clip of incoming) {
    if (!isRecord(clip) || typeof clip['id'] !== 'string') continue;
    const key = `${participantId}:${clip['id']}`;
    const previous = merged.get(key);
    const previousIds =
      isRecord(previous) && Array.isArray(previous['eventIds'])
        ? previous['eventIds']
        : [];
    const incomingIds = Array.isArray(clip['eventIds']) ? clip['eventIds'] : [];
    merged.set(key, {
      ...(isRecord(previous) ? previous : {}),
      ...clip,
      participantId,
      eventIds: [...new Set([...previousIds, ...incomingIds])],
      truncated:
        (isRecord(previous) && previous['truncated'] === true) ||
        clip['truncated'] === true,
    });
  }
  return [...merged.values(), ...current.filter((clip) => !isRecord(clip))];
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, maxLength)
    : undefined;
}

function isValidViewport(
  value: unknown,
): value is Readonly<{ width: number; height: number }> {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value['width']) &&
    Number.isSafeInteger(value['height']) &&
    (value['width'] as number) >= 1 &&
    (value['height'] as number) >= 1 &&
    (value['width'] as number) <= 16_384 &&
    (value['height'] as number) <= 16_384
  );
}

function isSessionEvent(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['sequence'] === 'number' &&
    typeof value['timestamp'] === 'number' &&
    typeof value['kind'] === 'string' &&
    typeof value['phase'] === 'string'
  );
}

function isInitialSnapshot(event: Record<string, unknown>): boolean {
  return event['kind'] === 'snapshot' && event['name'] === 'initial';
}

function findInitialSnapshot(
  events: readonly Record<string, unknown>[],
): Readonly<Record<string, unknown>> | undefined {
  const event = events.find(isInitialSnapshot);
  return isRecord(event?.['state']) ? event.state : undefined;
}

function validIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
