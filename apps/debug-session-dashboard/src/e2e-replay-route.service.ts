import {
  BrowserLocationService,
  CraftHttpClient,
  craftEffect,
  craftService,
  query,
  rawReactiveValue,
} from '@craft-ts/core';
import { onWindowMessage } from './replay-browser';
import { isRecord } from './replay-model';
import {
  importJson,
  scheduleReplayPreparation,
  seekReplayToRecordedEvent,
} from './replay-session';

const rawDecoder = { decode: (input: unknown) => input };

/** Resolves the portable export named by the isolated replay route. */
export const { E2eReplayRoute: E2eReplayRouteService } = craftService(
  { name: 'e2eReplayRoute', providedIn: 'global' },
  function* () {
    const sourceSession = yield* query('sourceSession', {
      method: (source: string) => source,
      loader: function* ({ params: source }) {
        return yield* CraftHttpClient.get(({ response }) => ({
          url: source,
          success: response(rawDecoder),
        }));
      },
    });
    const sourceValue = rawReactiveValue(sourceSession.value);
    const browserLocation = yield* BrowserLocationService();
    const dashboardOrigin = browserLocation.origin();
    let loaded: unknown;
    yield* craftEffect('installE2eReplaySession', () => {
      const next = sourceValue();
      if (!isRecord(next) || next === loaded) return;
      loaded = next;
      importJson(JSON.stringify(next), { preserveRoute: true });
      scheduleReplayPreparation();
    });
    onWindowMessage((message) => {
      const data = message.data;
      if (message.origin !== dashboardOrigin) return;
      if (!isRecord(data) || data['protocol'] !== 'craft-e2e-replay') return;
      if (typeof data['eventId'] === 'string' && data['eventId'])
        seekReplayToRecordedEvent(data['eventId']);
    });
  },
);
