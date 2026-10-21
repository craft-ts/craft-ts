import {
  CraftHttpClient,
  CraftTemporalRuntime,
  craftExpose,
  craftService,
  insertReactOnMutation,
  mutation,
  query,
  rawReactiveValue,
} from '@craft-ts/core';
import { isRecord } from './replay-model';

const SESSION_ARCHIVE_URL =
  import.meta.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] ?? 'http://127.0.0.1:4319';

/** How often the manifest is asked again while pictures are being prepared. */
const POLL_EVERY_MS = 1500;

export type ThumbnailStatus =
  | 'none'
  | 'pending'
  | 'running'
  | 'ready'
  | 'failed'
  | 'unavailable';

export type ThumbnailEntry = Readonly<{
  index: number;
  file: string;
  /** Actions that had run when the picture was taken. */
  replayIndex: number;
  participantId?: string;
  /** The last action that had run: the way to find the moment again. */
  eventId?: string;
  offsetMs: number;
  reasons: readonly string[];
  width: number;
  height: number;
}>;

export type ThumbnailManifest = Readonly<{
  sessionId: string;
  key: string;
  status: ThumbnailStatus;
  total: number;
  done: number;
  entries: readonly ThumbnailEntry[];
  error?: string;
  stoppedAtReplayIndex?: number;
}>;

const STATUSES: readonly ThumbnailStatus[] = [
  'none',
  'pending',
  'running',
  'ready',
  'failed',
  'unavailable',
];

function thumbnailStatusOf(value: unknown): ThumbnailStatus | undefined {
  return STATUSES.find((status) => status === value);
}

function isThumbnailEntry(value: unknown): value is ThumbnailEntry {
  return (
    isRecord(value) &&
    typeof value['index'] === 'number' &&
    typeof value['file'] === 'string' &&
    typeof value['replayIndex'] === 'number' &&
    typeof value['offsetMs'] === 'number' &&
    Array.isArray(value['reasons'])
  );
}

/** The archive answers a manifest; anything else is "nothing prepared". */
const manifestDecoder = {
  decode(input: unknown): ThumbnailManifest {
    const status = isRecord(input) ? thumbnailStatusOf(input['status']) : undefined;
    if (
      !isRecord(input) ||
      typeof input['sessionId'] !== 'string' ||
      status === undefined
    )
      return { sessionId: '', key: '', status: 'none', total: 0, done: 0, entries: [] };
    return {
      sessionId: input['sessionId'],
      key: typeof input['key'] === 'string' ? input['key'] : '',
      status,
      total: typeof input['total'] === 'number' ? input['total'] : 0,
      done: typeof input['done'] === 'number' ? input['done'] : 0,
      entries: Array.isArray(input['entries'])
        ? input['entries'].filter(isThumbnailEntry)
        : [],
      ...(typeof input['error'] === 'string' ? { error: input['error'] } : {}),
      ...(typeof input['stoppedAtReplayIndex'] === 'number'
        ? { stoppedAtReplayIndex: input['stoppedAtReplayIndex'] }
        : {}),
    };
  },
};

/** The origin pictures are loaded from: the archive's. */
export const THUMBNAIL_ORIGIN = new URL(SESSION_ARCHIVE_URL).origin;

/** Where a picture of the manifest is served from. */
export function thumbnailImageUrl(
  manifest: ThumbnailManifest,
  entry: ThumbnailEntry,
): string {
  return `${SESSION_ARCHIVE_URL}/sessions/${encodeURIComponent(manifest.sessionId)}/thumbnails/${entry.file}?k=${encodeURIComponent(manifest.key)}`;
}

/**
 * The pictures the archive prepares for a recording: asks it to prepare them,
 * then follows the manifest until the work is over. Only one recording is
 * followed at a time — the one on screen.
 */
export const { ThumbnailArchive } = craftService(
  { name: 'thumbnailArchive', providedIn: 'global' },
  function* () {
    const temporal = yield* CraftTemporalRuntime();

    const prepareThumbnails = yield* mutation('prepareThumbnails', {
      method: (request: Readonly<{ id: string; force: boolean }>) => request,
      loader: function* ({ params }) {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: `${SESSION_ARCHIVE_URL}/sessions/${encodeURIComponent(params.id)}/thumbnails${params.force ? '?force=1' : ''}`,
          payload: {},
          success: response(manifestDecoder),
        }));
      },
    });

    const thumbnailManifest = yield* query(
      'thumbnailManifest',
      {
        method: (id: string) => id,
        loader: function* ({ params: id }) {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: `${SESSION_ARCHIVE_URL}/sessions/${encodeURIComponent(id)}/thumbnails`,
            success: response(manifestDecoder),
          }));
        },
      },
      insertReactOnMutation(prepareThumbnails, {
        reload: { onMutationResolved: true },
      }),
    );


    const manifestValue = rawReactiveValue(thumbnailManifest.value);
    let watching: string | undefined;
    let pollRun = 0;

    const poll = (run: number): void => {
      if (run !== pollRun || watching === undefined) return;
      const current = manifestValue();
      const settled =
        current !== undefined &&
        current.sessionId === watching &&
        current.status !== 'pending' &&
        current.status !== 'running';
      // A finished job needs no more questions; a failed or idle one may be
      // retried by someone else, which restarts the poll.
      if (settled) return;
      thumbnailManifest.call(watching);
      temporal.schedule(() => poll(run), POLL_EVERY_MS, {
        owner: 'thumbnail-archive',
      });
    };

    const startPolling = (id: string): void => {
      watching = id;
      pollRun += 1;
      poll(pollRun);
    };

    yield* craftExpose('watch', (id: string, force = false) => {
      prepareThumbnails.mutate({ id, force });
      startPolling(id);
    });
    yield* craftExpose('stop', () => {
      watching = undefined;
      pollRun += 1;
    });
  },
);
