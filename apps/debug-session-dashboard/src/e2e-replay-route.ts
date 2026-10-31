import { craftComponent, div, heading } from '@craft-ts/component';
import { CraftActivatedRoute } from '@craft-ts/core';
import { E2eReplayRouteService } from './e2e-replay-route.service';

const SESSION_SERVER_URL =
  import.meta.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] ??
  'http://127.0.0.1:4319';
function sourceFromQuery(source: string | undefined): string | undefined {
  if (!source) return undefined;
  try {
    const parsed = new URL(source);
    const server = new URL(SESSION_SERVER_URL);
    return parsed.origin === server.origin &&
      (parsed.pathname.startsWith('/sessions/') || parsed.pathname.startsWith('/e2e-sessions/'))
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** Loads one versioned portable session into this isolated dashboard replay. */
export const E2eReplayRoute = craftComponent(
  'E2eReplayRoute',
  {},
  function* () {
    const route = yield* CraftActivatedRoute();
    const service = yield* E2eReplayRouteService();
    yield* service.loadSource(
      sourceFromQuery(route.snapshot.queryParams['source']),
    );
    return div([
      heading('Replay E2E'),
      div({ hidden: true, 'aria-hidden': 'true' }, []),
    ]);
  },
);
