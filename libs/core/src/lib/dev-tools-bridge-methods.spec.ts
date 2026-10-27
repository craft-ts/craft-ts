import { afterEach, describe, expect, it } from 'vitest';
import {
  ɵanswerCraftBridgeRequest,
  ɵregisterCraftMcpBridgeMethod,
} from './dev-tools-bridge-methods';

describe('MCP bridge requests', () => {
  afterEach(() => document.body.replaceChildren());

  it('answers page with the surface the broker reads: url, title, controls', async () => {
    document.title = 'Atelier';
    document.body.innerHTML = '<button data-craft-name="save">Enregistrer</button>';

    const answer = await ɵanswerCraftBridgeRequest('page', {}, async () => undefined);

    expect(answer).toEqual({
      url: location.href,
      title: 'Atelier',
      status: 'ready',
      controls: [expect.objectContaining({ id: 'save', role: 'button' })],
    });
  });

  it('relays other methods to what a library registered, and only those', async () => {
    const unregister = ɵregisterCraftMcpBridgeMethod('app/ping', (params) => ({ pong: params['n'] }));
    await expect(ɵanswerCraftBridgeRequest('app/ping', { n: 2 }, async () => undefined)).resolves.toEqual({ pong: 2 });
    unregister();
    await expect(ɵanswerCraftBridgeRequest('app/ping', {}, async () => undefined)).rejects.toThrow('does not answer app/ping');
  });
});
