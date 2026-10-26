import {
  CraftHttpClient,
  CraftTemporalRuntime,
  craftExpose,
  craftService,
  insertReactOnMutation,
  mutation,
  query,
  rawReactiveValue,
  state,
} from '@craft-ts/core';
import { isRecord } from './replay-model';

const SESSION_ARCHIVE_URL =
  import.meta.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] ?? 'http://127.0.0.1:4319';

/** How often the thread is read again while a session is open. */
const POLL_EVERY_MS = 2000;

/** One message of the resume thread: the AI's steps, the person's answers. */
export type ResumeMessage = Readonly<{
  id: number;
  at: string;
  from: 'ai' | 'person';
  kind: 'step' | 'question' | 'handoff' | 'done' | 'reply';
  text: string;
}>;

export type ResumeThreadState = Readonly<{
  /** The latest resume request of the session, if someone asked to resume. */
  requestId?: string;
  messages: readonly ResumeMessage[];
}>;

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

const sentDecoder = {
  decode(input: unknown): Readonly<{ id?: number }> {
    const message = isRecord(input) ? input['message'] : undefined;
    return isRecord(message) && typeof message['id'] === 'number'
      ? { id: message['id'] }
      : {};
  },
};

/**
 * The thread of a guided resume, beside the replay: what the AI says through
 * `resume.say`, and the answers the person writes back. It follows the latest
 * resume request of the open session, read again on a timer.
 */
export const { ResumeThread } = craftService(
  { name: 'resumeThread', providedIn: 'global' },
  function* () {
    const temporal = yield* CraftTemporalRuntime();

    const draft = yield* state('draft', '', ({ set }) => ({
      write: (text: string) => set(text),
    }));

    const reply = yield* mutation('reply', {
      method: (message: Readonly<{ requestId: string; text: string }>) => message,
      loader: function* ({ params }) {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: `${SESSION_ARCHIVE_URL}/sessions/resume-requests/${encodeURIComponent(params.requestId)}/messages`,
          payload: { from: 'person', text: params.text },
          success: response(sentDecoder),
        }));
      },
    });

    const thread = yield* query(
      'thread',
      {
        method: (sessionId: string) => sessionId,
        loader: function* ({ params: sessionId }) {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions/resume-requests/latest?${new URLSearchParams({ sessionId })}`,
            success: response(threadDecoder),
          }));
        },
      },
      // The person's answer shows in the thread as soon as it is saved.
      insertReactOnMutation(reply, { reload: { onMutationResolved: true } }),
    );

    const threadValue = rawReactiveValue(thread.value);
    const draftValue = rawReactiveValue(draft);
    let watching: string | undefined;
    let pollRun = 0;

    const poll = (run: number): void => {
      if (run !== pollRun || watching === undefined) return;
      thread.call(watching);
      temporal.schedule(() => poll(run), POLL_EVERY_MS, {
        owner: 'resume-thread',
      });
    };

    yield* craftExpose('watch', (sessionId: string) => {
      watching = sessionId;
      pollRun += 1;
      poll(pollRun);
    });
    yield* craftExpose('stop', () => {
      watching = undefined;
      pollRun += 1;
    });
    yield* craftExpose('send', () => {
      const requestId = threadValue()?.requestId;
      const text = draftValue().trim();
      if (!requestId || !text) return;
      reply.mutate({ requestId, text });
      draft.write('');
    });
  },
);
