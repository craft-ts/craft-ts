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

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT = 2_000;

/** Kept in memory: a request is a hand-over between two tools, not history. */
export class ResumeRequestBoard {
  readonly #requests: ResumeRequest[] = [];
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
    this.#requests.splice(this.#max);
    return request;
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
