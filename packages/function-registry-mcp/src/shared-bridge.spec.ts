import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { connectSharedRegistryBridge, type SharedRegistryBridge } from './shared-bridge.js';

const PORT = 4391;

async function appTab(): Promise<WebSocket> {
  const app = new WebSocket(`ws://127.0.0.1:${PORT}`);
  await new Promise<void>((resolve) => app.once('open', resolve));
  app.on('message', (raw) => {
    const message = JSON.parse(raw.toString()) as { type: string; callId: string; method: string };
    if (message.type !== 'request') return;
    app.send(JSON.stringify({ type: 'response', callId: message.callId, result: { answeredBy: 'tab', method: message.method } }));
  });
  app.send(JSON.stringify({ type: 'hello', role: 'registry-app', clientId: 'tab-a', pageUrl: 'http://localhost/admin' }));
  app.send(JSON.stringify({ type: 'page/surface', clientId: 'tab-a', url: 'http://localhost/admin', controls: [] }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  return app;
}

describe('shared registry bridge', () => {
  const opened: SharedRegistryBridge[] = [];
  let tab: WebSocket | undefined;
  afterEach(async () => {
    tab?.close();
    for (const bridge of opened.splice(0)) await bridge.close();
  });

  it('relays a second session to the one holding the port, then takes over when it leaves', async () => {
    const first = await connectSharedRegistryBridge({ port: PORT });
    opened.push(first);
    tab = await appTab();
    const second = await connectSharedRegistryBridge({ port: PORT });
    opened.push(second);

    expect([first.role(), second.role()]).toEqual(['broker', 'relay']);
    await expect(second.request('app/diff', { sessionId: 's' })).resolves.toEqual({
      answeredBy: 'tab',
      method: 'app/diff',
    });
    await expect(second.request('registry/clients')).resolves.toEqual([
      expect.objectContaining({ clientId: 'tab-a', status: 'ready' }),
    ]);

    await first.close();
    opened.splice(opened.indexOf(first), 1);
    await expect.poll(() => second.role(), { timeout: 5_000 }).toBe('broker');
  });
});
