import {
  CraftHttpClient,
  CraftTemporalRuntime,
  craftExpose,
  craftService,
  query,
  rawReactiveValue,
} from '@craft-ts/core';
import { isRecord } from './replay-model';

const SESSION_ARCHIVE_URL =
  import.meta.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] ?? 'http://127.0.0.1:4319';

/** How often the thread is read again while a session is open. */
const POLL_EVERY_MS = 2000;

/** One progress message attached to a resume request. */
export type ResumeMessage = Readonly<{
  id: number;
  at: string;
  from: 'ai' | 'person';
  kind: 'step' | 'question' | 'handoff' | 'done' | 'reply';
  text: string;
}>;

export type ResumeThreadState = Readonly<{
  /** The exact or latest resume request whose progress is being shown. */
  requestId?: string;
  messages: readonly ResumeMessage[];
}>;

type ResumeThreadLookup =
  | Readonly<{ requestId: string }>
  | Readonly<{ sessionId: string }>;

const MESSAGE_KINDS = new Set(['step', 'question', 'handoff', 'done', 'reply']);

function isResumeMessage(value: unknown): value is ResumeMessage {
  return (
    isRecord(value) &&
    typeof value['id'] === 'number' &&
    typeof value['at'] === 'string' &&
    (value['from'] === 'ai' || value['from'] === 'person') &&
    typeof value['kind'] === 'string' &&
    MESSAGE_KINDS.has(value['kind']) &&
    typeof value['text'] === 'string'
  );
}

const threadDecoder = {
  decode(input: unknown): ResumeThreadState {
    const request = isRecord(input) ? input['request'] : undefined;
    const messages = isRecord(input) ? input['messages'] : undefined;
    return {
      ...(isRecord(request) && typeof request['id'] === 'string'
        ? { requestId: request['id'] }
        : {}),
      messages: Array.isArray(messages) ? messages.filter(isResumeMessage) : [],
    };
  },
};

/**
 * The progress thread of a guided resume, beside the replay. It follows the
 * exact request after « Reprendre ici », and falls back to the latest request
 * for a session when the dashboard is opened later.
 */
export const { ResumeThread } = craftService(
  { name: 'resumeThread', providedIn: 'global' },
  function* () {
    const temporal = yield* CraftTemporalRuntime();

    const thread = yield* query('thread', {
      method: (lookup: ResumeThreadLookup) => lookup,
      loader: function* ({ params: lookup }) {
        const url =
          'requestId' in lookup
            ? `${SESSION_ARCHIVE_URL}/sessions/resume-requests/${encodeURIComponent(lookup.requestId)}`
            : `${SESSION_ARCHIVE_URL}/sessions/resume-requests/latest?${new URLSearchParams({ sessionId: lookup.sessionId })}`;
        return yield* CraftHttpClient.get(({ response }) => ({
          url,
          success: response(threadDecoder),
        }));
      },
    }, () => ({}));

    const threadValue = rawReactiveValue(thread.value);
    let watching: ResumeThreadLookup | undefined;
    let pollRun = 0;

    const poll = (run: number): void => {
      if (run !== pollRun || watching === undefined) return;
      thread.call(watching);
      temporal.schedule(() => poll(run), POLL_EVERY_MS, {
        owner: 'resume-thread',
      });
    };

    yield* craftExpose('watchSession', (sessionId: string) => {
      watching = { sessionId };
      pollRun += 1;
      poll(pollRun);
    });
    yield* craftExpose('watchRequest', (requestId: string) => {
      watching = { requestId };
      pollRun += 1;
      poll(pollRun);
    });
    yield* craftExpose('stop', () => {
      watching = undefined;
      pollRun += 1;
    });
  },
);
