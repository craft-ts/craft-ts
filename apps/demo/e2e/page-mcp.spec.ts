import { expect, test } from '@playwright/test';
import { WebSocket, WebSocketServer } from 'ws';

const bridgeUrl = 'ws://127.0.0.1:3335';

type BridgeResponse = {
  type: 'response';
  callId: string;
  result?: unknown;
  error?: { message: string };
};

type PageControl = {
  id: string;
};

test('goes to the login form through page act then fills it without reloading', async ({
  page,
}) => {
  const clientId = 'e2e-page-client';
  await page.addInitScript(
    ({ storageKey, value }) => sessionStorage.setItem(storageKey, value),
    {
      storageKey: 'craft-ts.function-registry.client-id',
      value: clientId,
    },
  );
  await page.addInitScript(
    ({ url }) => {
      (
        window as Window & {
          __CRAFT_FUNCTION_REGISTRY_BRIDGE_URL__?: string;
        }
      ).__CRAFT_FUNCTION_REGISTRY_BRIDGE_URL__ = url;
    },
    { url: bridgeUrl },
  );

  const server = new WebSocketServer({ host: '127.0.0.1', port: 3335 });
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  let nextCallId = 1;
  let appSocket: WebSocket | undefined;
  let controls: PageControl[] = [];
  let loads = 0;
  page.on('load', () => {
    loads += 1;
  });

  server.on('connection', (socket) => {
    socket.on('message', (rawMessage) => {
      const message = JSON.parse(rawMessage.toString()) as Record<
        string,
        unknown
      >;
      if (message['type'] === 'hello' && message['clientId'] === clientId) {
        appSocket = socket;
        return;
      }
      if (
        message['type'] === 'page/surface' &&
        message['clientId'] === clientId
      ) {
        controls = (message['controls'] as PageControl[]) ?? [];
        return;
      }
      if (message['type'] === 'response') {
        const response = message as BridgeResponse;
        const call = pending.get(response.callId);
        if (call === undefined) return;
        pending.delete(response.callId);
        if (response.error === undefined) {
          call.resolve(response.result);
        } else {
          call.reject(new Error(response.error.message));
        }
      }
    });
  });

  const request = (method: string, params: Record<string, unknown>) => {
    const callId = `e2e-page-${nextCallId++}`;
    return new Promise<unknown>((resolve, reject) => {
      pending.set(callId, { resolve, reject });
      appSocket?.send(
        JSON.stringify({ type: 'request', callId, method, params }),
      );
    });
  };

  try {
    await page.goto('/');
    const loadsAfterHome = loads;
    await expect
      .poll(() => controls.some((control) => control.id === 'navToggle'))
      .toBeTruthy();

    const result = (await request('page', {
      act: [
        { goto: '/login-form' },
        { id: 'email', fill: 'ada@example.com' },
        { id: 'password', fill: 'secret1' },
        { id: 'submit' },
      ],
    })) as { error?: string };

    expect(result.error).toBeUndefined();
    expect(loads).toBe(loadsAfterHome);
    await expect(page).toHaveURL(/\/login-form$/);
    await expect(page.getByText('Login form submitted.')).toBeVisible();
  } finally {
    for (const socket of server.clients) socket.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  }
});
