import { randomUUID } from 'node:crypto';

/**
 * A point of a recorded session someone asked to resume from. The dashboard
 * posts it; the AI reads the latest one through the `resume.request` tool, so
 * "reprends ici" needs no copied identifiers.
 */
export type ResumeRequest = Readonly<{
  id: string;
  sessionId: string;
  participantId?: string;
  /** The resume point is just before this event. */
  beforeSequence?: number;
  eventId?: string;
  note?: string;
  createdAt: string;
}>;

export type ResumeRequestInput = Omit<ResumeRequest, 'id' | 'createdAt'>;

/**
 * The thread of one resume, shown in the dashboard next to the replay: the AI
 * says its steps and hand-offs, the person may answer there.
 */
export type ResumeMessage = Readonly<{
  id: number;
  at: string;
  from: 'ai' | 'person';
  kind: 'step' | 'question' | 'handoff' | 'done' | 'reply';
  text: string;
}>;

export type ResumeMessageInput = Pick<ResumeMessage, 'from' | 'kind' | 'text'>;

const MESSAGE_KINDS = new Set<ResumeMessage['kind']>(['step', 'question', 'handoff', 'done', 'reply']);
const MAX_MESSAGES = 200;

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT = 2_000;

/** Kept in memory: a request is a hand-over between two tools, not history. */
export class ResumeRequestBoard {
  readonly #requests: ResumeRequest[] = [];
  readonly #threads = new Map<string, ResumeMessage[]>();
  #nextMessageId = 0;
  readonly #max: number;
  readonly #now: () => Date;

  constructor(max = 20, now: () => Date = () => new Date()) {
    this.#max = max;
    this.#now = now;
  }

  add(input: ResumeRequestInput): ResumeRequest {
    const request: ResumeRequest = {
      ...input,
      id: randomUUID(),
      createdAt: this.#now().toISOString(),
    };
    this.#requests.unshift(request);
    for (const dropped of this.#requests.splice(this.#max))
      this.#threads.delete(dropped.id);
    return request;
  }

  /** Adds to the thread of a request; undefined when the request is gone. */
  say(requestId: string, input: ResumeMessageInput): ResumeMessage | undefined {
    if (!this.#requests.some((request) => request.id === requestId)) return undefined;
    const message: ResumeMessage = {
      ...input,
      id: ++this.#nextMessageId,
      at: this.#now().toISOString(),
    };
    const thread = this.#threads.get(requestId) ?? [];
    thread.push(message);
    thread.splice(0, Math.max(0, thread.length - MAX_MESSAGES));
    this.#threads.set(requestId, thread);
    return message;
  }

  /** The messages of a request after `since` (a message id), oldest first. */
  messages(requestId: string, since = 0): readonly ResumeMessage[] {
    return (this.#threads.get(requestId) ?? []).filter((message) => message.id > since);
  }

  latest(sessionId?: string): ResumeRequest | undefined {
    return this.#requests.find(
      (request) => sessionId === undefined || request.sessionId === sessionId,
    );
  }

  list(): readonly ResumeRequest[] {
    return [...this.#requests];
  }
}

export function parseResumeRequestInput(
  value: unknown,
): ResumeRequestInput | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const sessionId = record['sessionId'];
  if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId))
    return undefined;
  const beforeSequence = record['beforeSequence'];
  if (
    beforeSequence !== undefined &&
    (typeof beforeSequence !== 'number' ||
      !Number.isInteger(beforeSequence) ||
      beforeSequence < 0)
  )
    return undefined;
  const texts = {} as Record<'participantId' | 'eventId' | 'note', string>;
  for (const key of ['participantId', 'eventId', 'note'] as const) {
    const text = record[key];
    if (text === undefined) continue;
    if (typeof text !== 'string' || text.length > MAX_TEXT) return undefined;
    texts[key] = text;
  }
  return {
    sessionId,
    ...(beforeSequence === undefined ? {} : { beforeSequence }),
    ...texts,
  };
}

export function parseResumeMessageInput(value: unknown): ResumeMessageInput | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const from = record['from'];
  if (from !== 'ai' && from !== 'person') return undefined;
  const text = record['text'];
  if (typeof text !== 'string' || text.trim().length === 0 || text.length > MAX_TEXT)
    return undefined;
  const kind = record['kind'] ?? (from === 'ai' ? 'step' : 'reply');
  if (typeof kind !== 'string' || !MESSAGE_KINDS.has(kind as ResumeMessage['kind']))
    return undefined;
  return { from, kind: kind as ResumeMessage['kind'], text: text.trim() };
}
