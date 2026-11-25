// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureCraftReplayTransportEvent,
  craftReplayAdapter,
  provideCraftReplayTransports,
  ɵinjectSendContextSession,
  ɵrunInInjectionContext as runInInjectionContext,
  ɵsetCraftReplayMode,
  type CraftInjector,
} from '@craft-ts/core';
import {
  ɵcreateCraftApplicationInjector,
  ɵrunCraftAppInitializers,
} from '../bootstrap';
import { provideCraftDebugSessionCapture } from './send-context-to-ai';
import { provideCraftDebugReplayBridge } from './debug-session-replay-bridge';
import { CRAFT_DEBUG_REPLAY_CHANNEL } from './debug-session-replay-signals';

const DASHBOARD_ORIGIN = 'http://dashboard.test';

type PostedMessage = Readonly<Record<string, unknown>> & { type: string };

describe('debug session replay bridge with a custom transport adapter', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    ɵsetCraftReplayMode(false);
    vi.restoreAllMocks();
  });

  /** Boots the bridge inside an iframe-like page controlled by the dashboard. */
  function bootReplayTarget(replay: (data: unknown) => void) {
    const posted: PostedMessage[] = [];
    const dashboard = {
      postMessage: (message: PostedMessage) => posted.push(message),
    } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(
      dashboard as unknown as Window & typeof globalThis,
    );
    const adapter = craftReplayAdapter({
      id: 'probe57',
      match: () => false,
      record: (context) => context.data,
      replay: (context) => replay(context.data),
    });
    const injector: CraftInjector = ɵcreateCraftApplicationInjector({
      providers: [
        ...provideCraftReplayTransports(adapter),
        ...provideCraftDebugSessionCapture(),
        ...provideCraftDebugReplayBridge({ parentOrigins: [DASHBOARD_ORIGIN] }),
      ],
    });
    cleanups.push(() => injector.destroy());
    for (const result of ɵrunCraftAppInitializers(injector))
      if (typeof result === 'function') cleanups.push(result as () => void);
    const session = runInInjectionContext(injector, () =>
      ɵinjectSendContextSession(),
    );
    if (!session) throw new Error('The debug session capture is not enabled.');
    return { adapter, session, posted, dashboard };
  }

  /** Sends a message as the dashboard does, through the window message path. */
  function sendFromDashboard(
    dashboard: Window,
    data: Readonly<Record<string, unknown>>,
  ): void {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: CRAFT_DEBUG_REPLAY_CHANNEL, ...data },
        origin: DASHBOARD_ORIGIN,
        source: dashboard as unknown as MessageEventSource,
      }),
    );
  }

  it('replays a recorded custom transport event through its registered adapter', async () => {
    const replayed = vi.fn();
    const { adapter, session, posted, dashboard } = bootReplayTarget(replayed);
    captureCraftReplayTransportEvent(session, adapter, {
      id: 'probe57',
      url: 'probe:57',
      direction: 'incoming',
      messageType: 'probe',
      data: { n: 1 },
      elapsedMs: 0,
    });
    // One replay step after the transport message: replaying that step moves
    // the replay timeline past the message, as a recorded interaction does.
    session.capture('hover', 'emitted', {
      name: 'hover:enter',
      elapsedMs: 5,
      payload: { action: 'enter', selector: 'body', clientX: 1, clientY: 1 },
    });

    sendFromDashboard(dashboard, {
      type: 'start',
      session: session.exportSessionJson(),
    });

    // The bridge answers a start with either an error or a ready status.
    await vi.waitFor(() => expect(posted).not.toEqual([]));
    const errors = posted
      .filter((message) => message.type === 'error')
      .map((message) => String(message['message']));
    expect(errors).not.toContain(
      'Replay transport adapter is not registered: probe57.',
    );
    expect(errors).toEqual([]);
    expect(posted).toContainEqual(
      expect.objectContaining({ type: 'status', status: 'ready' }),
    );

    sendFromDashboard(dashboard, { type: 'step' });

    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({ type: 'step', state: 'completed' }),
      ),
    );
    expect(replayed).toHaveBeenCalledOnce();
    expect(replayed).toHaveBeenCalledWith({ n: 1 });
    expect(posted.filter((message) => message.type === 'error')).toEqual([]);
  });
});
