import { craftComponent, div } from '@craft-ts/component';
import { currentHash } from './replay-browser';
import { E2eReplayRouteService } from './e2e-replay-route.service';

const SESSION_SERVER_URL =
  import.meta.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] ??
  'http://127.0.0.1:4319';
function sourceFromHash(hash: string): string | undefined {
  const search = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const source = new URLSearchParams(search).get('source');
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
    const service = yield* E2eReplayRouteService();
    const sourceQuery = service.sourceSession;
    const source = sourceFromHash(currentHash());
    if (source) sourceQuery.call(source);
    return div({ hidden: true, 'aria-hidden': 'true' }, []);
  },
);
