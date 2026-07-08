/* eslint-disable playwright/no-standalone-expect */
import {
  handleFunctionRegistryRequest,
  respondToBridgeMessage,
  type RegistryBridgeRequest,
} from './function-registry-bridge';
import { createFunctionRegistry } from './function-registry';

describe('function registry WebSocket bridge', () => {
  it('transmits the registry list with the callId', async () => {
    const registry = createFunctionRegistry();
    registry.register('save', ['Editor'], () => undefined);
    const sent: string[] = [];

    await respondToBridgeMessage(
      { send: (message) => sent.push(message) },
      JSON.stringify(request('list-1', 'registry/list')),
      registry,
    );

    expect(JSON.parse(sent[0] ?? '')).toEqual({
      type: 'response',
      callId: 'list-1',
      result: [
        {
          key: 'save <= Editor',
          hostName: 'save',
          ancestry: ['Editor'],
        },
      ],
    });
  });

  it('transmits an invocation and its result', async () => {
    const registry = createFunctionRegistry();
    const fn = vi.fn((value: unknown) => `received:${String(value)}`);
    registry.register('send', [], fn);
    const sent: string[] = [];

    await respondToBridgeMessage(
      { send: (message) => sent.push(message) },
      JSON.stringify(
        request('call-1', 'registry/call', { key: 'send', args: [42] }),
      ),
      registry,
    );

    expect(fn).toHaveBeenCalledWith(42);
    expect(JSON.parse(sent[0] ?? '')).toEqual({
      type: 'response',
      callId: 'call-1',
      result: 'received:42',
    });
  });

  it('transmits execution errors without losing the callId', async () => {
    const registry = createFunctionRegistry();
    registry.register('explode', [], () => {
      throw new Error('boom');
    });
    const sent: string[] = [];

    await respondToBridgeMessage(
      { send: (message) => sent.push(message) },
      JSON.stringify(request('call-2', 'registry/call', { key: 'explode' })),
      registry,
    );

    expect(JSON.parse(sent[0] ?? '')).toEqual({
      type: 'response',
      callId: 'call-2',
      error: { message: 'boom' },
    });
  });

  it('filters observable logs by id', async () => {
    const registry = createFunctionRegistry();
    registry.register('first', [], () => undefined);
    const currentLogs = registry.logs();
    const firstId = currentLogs[currentLogs.length - 1]?.id ?? 0;
    registry.register('second', [], () => undefined);

    const logs = await handleFunctionRegistryRequest(
      request('logs-1', 'registry/logs', { sinceId: firstId }),
      registry,
    );

    expect(logs).toEqual([
      expect.objectContaining({ event: 'registered', key: 'second' }),
    ]);
  });
});

function request(
  callId: string,
  method: RegistryBridgeRequest['method'],
  params?: Readonly<Record<string, unknown>>,
): RegistryBridgeRequest {
  return {
    type: 'request',
    callId,
    method,
    ...(params === undefined ? {} : { params }),
  };
}
