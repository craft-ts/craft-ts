import {
  BrowserLocationService,
  CraftHttpClient,
  craftEffect,
  craftExpose,
  craftGen,
  craftService,
  craftUse,
  query,
} from '@craft-ts/core';
import { ReplaySession } from '../../shared/state/replay-session';
import { onWindowMessage } from '../../shared/util/replay-browser';
import { isRecord } from '../../shared/util/replay-model';

const rawDecoder = { decode: (input: unknown) => input };

/** Resolves the portable export named by the isolated replay route. */
export const { E2eReplayRoute: E2eReplayRouteService } = craftService(
  { name: 'e2eReplayRoute', providedIn: 'global' },
  function* () {
    const replaySession = yield* ReplaySession();
    const sourceSession = yield* query('sourceSession', {
      method: (source: string) => source,
      loader: function* ({ params: source }) {
        return yield* CraftHttpClient.get(({ response }) => ({
          url: source,
          success: response(rawDecoder),
        }));
      },
    });
    yield* craftExpose(
      'loadSource',
      craftGen(function* (source: string | undefined) {
        if (source) yield* sourceSession.call(source);
      }),
    );
    const sourceValue = sourceSession.value;
    const browserLocation = yield* BrowserLocationService();
    const dashboardOrigin = browserLocation.origin();
    let loaded: unknown;
    yield* craftEffect('installE2eReplaySession', () => {
      const next = craftUse(sourceValue());
      if (!isRecord(next) || next === loaded) return;
      loaded = next;
      replaySession.importJson(JSON.stringify(next));
      replaySession.scheduleReplayPreparation();
    });
    onWindowMessage((message) => {
      const data = message.data;
      if (message.origin !== dashboardOrigin) return;
      if (!isRecord(data) || data['protocol'] !== 'craft-e2e-replay') return;
      if (typeof data['eventId'] === 'string' && data['eventId'])
        replaySession.seekReplayToRecordedEvent(data['eventId']);
    });
  },
);
