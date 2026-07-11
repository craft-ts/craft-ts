import { expect, test } from '@playwright/test';
import { WebSocket, WebSocketServer } from 'ws';

type BridgeResponse = {
  type: 'response';
  callId: string;
  result?: unknown;
  error?: { message: string };
};

test('overrides a state method without reloading the page', async ({
  page,
}) => {
  const clientId = 'e2e-override-client';
  await page.addInitScript(
    ({ storageKey, value }) => sessionStorage.setItem(storageKey, value),
    {
      storageKey: 'ng-craft.function-registry.client-id',
      value: clientId,
    },
  );
  const server = new WebSocketServer({ host: '127.0.0.1', port: 3333 });
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  let nextCallId = 1;
  let appSocket: WebSocket | undefined;
  let entries: Array<{
    key: string;
    hostName: string;
    capabilities: string[];
    overrideActive: boolean;
  }> = [];

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
        message['type'] === 'registry/snapshot' &&
        message['clientId'] === clientId
      ) {
        entries = message['entries'] as typeof entries;
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
    const callId = `e2e-${nextCallId++}`;
    return new Promise<unknown>((resolve, reject) => {
      pending.set(callId, { resolve, reject });
      appSocket?.send(
        JSON.stringify({ type: 'request', callId, method, params }),
      );
    });
  };

  try {
    await page.goto('/');
    const increment = page.getByRole('button', { name: 'Increment' });
    await expect
      .poll(() =>
        entries.find(
          (entry) =>
            entry.hostName === 'method:increment' &&
            entry.capabilities.includes('state.update'),
        ),
      )
      .toBeTruthy();

    await increment.click();
    await expect(page.locator('app-test')).toContainText('Counter 1 /');
    const key = entries.find(
      (entry) =>
        entry.hostName === 'method:increment' &&
        entry.capabilities.includes('state.update'),
    )?.key;
    expect(key).toBeDefined();

    const installed = await request('registry/override', {
      key,
      source: '({ state }) => state.update(current => current + 10)',
    });
    expect(installed).toMatchObject({ key, overrideActive: true });
    await expect
      .poll(
        () =>
          entries.find((entry) => entry.key === key)?.overrideActive ?? false,
      )
      .toBe(true);
    await increment.click();
    await expect(page.locator('app-test')).toContainText('Counter 11 /');

    await request('registry/restore', { key });
    await increment.click();
    await expect(page.locator('app-test')).toContainText('Counter 12 /');
  } finally {
    for (const socket of server.clients) socket.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  }
});

test('removes the previous page entries after internal navigation', async ({
  page,
}) => {
  const clientId = 'e2e-navigation-client';
  await page.addInitScript(
    ({ storageKey, value }) => sessionStorage.setItem(storageKey, value),
    {
      storageKey: 'ng-craft.function-registry.client-id',
      value: clientId,
    },
  );
  const server = new WebSocketServer({ host: '127.0.0.1', port: 3333 });
  let entries: Array<{
    key: string;
    hostName: string;
    ancestry: string[];
  }> = [];

  server.on('connection', (socket) => {
    socket.on('message', (rawMessage) => {
      const message = JSON.parse(rawMessage.toString()) as Record<
        string,
        unknown
      >;
      if (
        message['type'] === 'registry/snapshot' &&
        message['clientId'] === clientId
      ) {
        entries = message['entries'] as typeof entries;
      }
    });
  });

  try {
    await page.goto('/');
    await expect
      .poll(() =>
        entries.some((entry) => entry.hostName === 'method:increment'),
      )
      .toBe(true);

    await page.getByRole('link', { name: 'craftService Counter' }).click();
    await expect(page).toHaveURL(/\/craft-service\/counter$/);
    await expect
      .poll(() =>
        entries.some((entry) => entry.hostName === 'method:increment'),
      )
      .toBe(true);
    await expect
      .poll(() =>
        entries.some(
          (entry) =>
            entry.hostName === 'method:increment' &&
            entry.ancestry.some((tag) =>
              tag.includes('component:CraftServiceCounterComponent'),
            ),
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        entries.some((entry) =>
          entry.ancestry.some((tag) => tag.includes('component:TestComponent')),
        ),
      )
      .toBe(false);
  } finally {
    for (const socket of server.clients) socket.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  }
});
