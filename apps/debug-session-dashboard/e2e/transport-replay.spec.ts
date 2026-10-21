import { expect, test } from '@playwright/test';

const demoOrigin = process.env['CRAFT_E2E_DEMO_ORIGIN']!;
const workspacePath = process.cwd();
const transportsModuleUrl = `/@fs/${workspacePath}/libs/core/src/lib/craft-replay-transports.ts`;
const sessionModuleUrl = `/@fs/${workspacePath}/libs/core/src/lib/send-context-to-ai.tokens.ts`;
const replayModuleUrl = `/@fs/${workspacePath}/libs/component/src/lib/ai/debug-session-replay.ts`;

test('keeps replay moving and shows recorded coordinates when a hover target is missing', async ({
  page,
}) => {
  await page.goto(demoOrigin);
  const result = await page.evaluate(async (replayModuleUrl) => {
    const replayModule = await import(replayModuleUrl);
    document.body.innerHTML = '<button id="next-target">Next</button>';
    const target = document.querySelector('#next-target')!;
    let pointerEvents = 0;
    target.addEventListener('pointerover', () => pointerEvents++);
    const warnings: string[] = [];
    const errors: string[] = [];
    const displayed: Array<{
      id: string;
      bodyFallback: boolean;
      x: unknown;
      y: unknown;
    }> = [];
    const events = [
      {
        id: 'missing-hover',
        sequence: 1,
        timestamp: 10,
        elapsedMs: 0,
        kind: 'hover',
        phase: 'emitted',
        name: 'hover:enter',
        payload: {
          action: 'enter',
          selector: '#removed-before-replay',
          clientX: 25,
          clientY: 15,
        },
      },
      {
        id: 'next-hover',
        sequence: 2,
        timestamp: 20,
        elapsedMs: 10,
        kind: 'hover',
        phase: 'emitted',
        name: 'hover:enter',
        payload: {
          action: 'enter',
          selector: '#next-target',
          clientX: 40,
          clientY: 20,
        },
      },
    ];
    const replay = replayModule.createReplayController(
      {
        format: 'craft-debug-session',
        version: 6,
        startUrl: location.href,
        exportedAt: 20,
        truncated: false,
        clips: [],
        events,
      },
      {
        onWarning: (message: string) => warnings.push(message),
        onError: (message: string) => errors.push(message),
        onInteraction: (
          event: (typeof events)[number],
          resolved: HTMLElement,
        ) => {
          displayed.push({
            id: event.id,
            bodyFallback: resolved === document.body,
            x: event.payload.clientX,
            y: event.payload.clientY,
          });
        },
      },
    );
    await replay.step();
    await replay.step();
    const index = replay.index();
    replay.stop();
    return { warnings, errors, displayed, index, pointerEvents };
  }, replayModuleUrl);

  expect(result.errors).toEqual([]);
  expect(
    result.warnings.some((message) =>
      message.includes('hover target selector was not found'),
    ),
  ).toBe(true);
  expect(result.displayed).toEqual([
    { id: 'missing-hover', bodyFallback: true, x: 25, y: 15 },
    { id: 'next-hover', bodyFallback: false, x: 40, y: 20 },
  ]);
  expect(result.index).toBe(2);
  expect(result.pointerEvents).toBe(0);
});

test('replays WebSocket and Worker traffic without constructing live transports', async ({
  page,
}) => {
  let socketConnections = 0;
  await page.routeWebSocket(
    'ws://transport.test/api/notifications*',
    (socket) => {
      socketConnections += 1;
      socket.onMessage((message) =>
        socket.send(message === 'ping' ? 'pong' : message),
      );
    },
  );
  await page.goto(demoOrigin);

  const result = await page.evaluate(
    async ({ transportsModuleUrl, sessionModuleUrl }) => {
      const debug: string[] = [];
      const waitFor = <T>(label: string, promise: Promise<T>) =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(
              () =>
                reject(new Error(`Timed out at ${label}: ${debug.join(', ')}`)),
              5_000,
            ),
          ),
        ]);
      const transports = await import(transportsModuleUrl);
      const sessions = await import(sessionModuleUrl);
      const session = sessions.createSendContextSession();
      const socketAdapter = transports.craftWebSocketReplay({
        id: 'notifications',
        match: (url: string) => new URL(url).pathname === '/api/notifications',
      });
      const socketCaptureCleanup =
        transports.connectCraftReplayTransportCapture(session, [socketAdapter]);
      const recordedSocketMessages: string[] = [];
      await waitFor(
        'capture WebSocket',
        new Promise<void>((resolve, reject) => {
          const socket = new WebSocket(
            'ws://transport.test/api/notifications?secret=hidden',
          );
          socket.addEventListener('open', () => {
            debug.push('open');
            socket.send('ping');
          });
          socket.addEventListener('message', (event) => {
            debug.push('message');
            recordedSocketMessages.push((event as MessageEvent).data);
            socket.close(1000, 'done');
          });
          socket.addEventListener('close', () => resolve(), { once: true });
          socket.addEventListener('error', () =>
            reject(new Error('WebSocket capture failed')),
          );
        }),
      );
      socketCaptureCleanup();

      const nativeWorker = globalThis.Worker;
      let nativeWorkerConstructions = 0;
      globalThis.Worker = new Proxy(nativeWorker, {
        construct(target, args, newTarget) {
          nativeWorkerConstructions += 1;
          return Reflect.construct(target, args, newTarget);
        },
      });
      const workerAdapter = transports.craftWorkerReplay({
        id: 'search-index',
        match: (url: string) => url.startsWith('blob:'),
      });
      const workerCaptureCleanup =
        transports.connectCraftReplayTransportCapture(session, [workerAdapter]);
      const workerScript = URL.createObjectURL(
        new Blob(
          [
            'self.onmessage = (event) => self.postMessage({ result: event.data.query });',
          ],
          { type: 'text/javascript' },
        ),
      );
      const recordedWorkerMessages: unknown[] = [];
      await waitFor(
        'capture Worker',
        new Promise<void>((resolve, reject) => {
          const worker = new Worker(workerScript);
          worker.onmessage = (event) => {
            recordedWorkerMessages.push(event.data);
            worker.terminate();
            resolve();
          };
          worker.onerror = () => reject(new Error('Worker capture failed'));
          worker.postMessage({ query: 'craft' });
        }),
      );
      workerCaptureCleanup();
      URL.revokeObjectURL(workerScript);

      const socketEvents = session.events.filter(
        (event: { kind: string; payload: { transport?: string } }) =>
          event.kind === 'transport' && event.payload.transport === 'websocket',
      );
      const socketReplay = transports.installCraftReplayTransports(
        [socketAdapter],
        socketEvents,
        (difference: unknown) => debug.push(JSON.stringify(difference)),
      );
      const replaySocketMessages: string[] = [];
      await waitFor(
        'replay WebSocket',
        new Promise<void>((resolve, reject) => {
          const socket = new WebSocket(
            'ws://transport.test/api/notifications?secret=other',
          );
          socket.addEventListener('open', () => socket.send('ping'));
          socket.addEventListener('message', (event) => {
            replaySocketMessages.push((event as MessageEvent).data);
            socket.close(1000, 'done');
          });
          socket.addEventListener('close', () => resolve(), { once: true });
          socket.addEventListener('error', () =>
            reject(new Error('Fake WebSocket failed')),
          );
          socketReplay.advanceTo(Number.MAX_SAFE_INTEGER);
        }),
      );
      socketReplay.assertComplete();
      socketReplay.restore();

      const workerEvents = session.events.filter(
        (event: { kind: string; payload: { transport?: string } }) =>
          event.kind === 'transport' && event.payload.transport === 'worker',
      );
      const workerReplay = transports.installCraftReplayTransports(
        [workerAdapter],
        workerEvents,
        (difference: unknown) => debug.push(JSON.stringify(difference)),
      );
      const replayWorkerMessages: unknown[] = [];
      await waitFor(
        'replay Worker',
        new Promise<void>((resolve, reject) => {
          const worker = new Worker(workerScript);
          worker.onmessage = (event) => {
            replayWorkerMessages.push(event.data);
            worker.terminate();
            resolve();
          };
          worker.onerror = () => reject(new Error('Fake Worker failed'));
          worker.postMessage({ query: 'craft' });
          workerReplay.advanceTo(Number.MAX_SAFE_INTEGER);
        }),
      );
      workerReplay.assertComplete();
      workerReplay.restore();
      session.destroy();
      return {
        recordedSocketMessages,
        replaySocketMessages,
        recordedWorkerMessages,
        replayWorkerMessages,
        nativeWorkerConstructions,
        transportDifferences: debug.filter((entry) => entry.startsWith('{')),
        socketUrl: socketEvents.find(
          (event: { kind: string; payload: { messageType?: string } }) =>
            event.kind === 'transport' &&
            event.payload.messageType === 'created',
        )?.payload,
      };
    },
    { transportsModuleUrl, sessionModuleUrl },
  );

  expect(result.recordedSocketMessages).toEqual(['pong']);
  expect(result.replaySocketMessages).toEqual(['pong']);
  expect(result.recordedWorkerMessages).toEqual([{ result: 'craft' }]);
  expect(result.replayWorkerMessages).toEqual([{ result: 'craft' }]);
  expect(result.nativeWorkerConstructions).toBe(1);
  expect(result.transportDifferences).toEqual([]);
  expect(socketConnections).toBe(1);
  expect(JSON.stringify(result.socketUrl)).not.toContain('secret');
});
