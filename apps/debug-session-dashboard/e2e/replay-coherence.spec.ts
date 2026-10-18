import { expect, test, type Page } from '@playwright/test';

const DEMO_ORIGIN =
  process.env['CRAFT_E2E_DEMO_ORIGIN'] ?? 'http://localhost:4201';
const DASHBOARD_ORIGIN =
  process.env['CRAFT_E2E_DASHBOARD_ORIGIN'] ?? 'http://localhost:4211';
const SESSION_SERVER_ORIGIN =
  process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] ?? 'http://127.0.0.1:4321';

type SessionSummary = Readonly<{ id: string }>;

/** The recording's details sit in the side panel, which is closed until asked for. */
async function openDetails(dashboard: Page): Promise<void> {
  const toggle = dashboard.getByRole('button', {
    name: 'Journal',
    exact: true,
  });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true')
    await toggle.click();
  await dashboard.getByRole('tab', { name: 'Détails' }).click();
}
type StoredSession = Readonly<{
  status?: string;
  participants?: readonly Readonly<{
    id: string;
    state: string;
    startUrl: string;
    status?: string;
    environment?: Readonly<Record<string, unknown>>;
  }>[];
  viewport?: Readonly<{ width: number; height: number }>;
  events: readonly Readonly<{
    kind: string;
    phase: string;
    participantId?: string;
    name?: string;
    payload?: Readonly<Record<string, unknown>>;
  }>[];
}>;

test('captures browser environment and acknowledges page-close completion', async ({
  browser,
  request,
}) => {
  const before = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
  ).json()) as { sessions: readonly SessionSummary[] };
  const previousIds = new Set(before.sessions.map((item) => item.id));
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${DEMO_ORIGIN}/`);
  await page.getByRole('button', { name: 'Add a user' }).click();

  let sessionId = '';
  await expect
    .poll(async () => {
      const result = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as { sessions: readonly SessionSummary[] };
      sessionId =
        result.sessions.find((item) => !previousIds.has(item.id))?.id ?? '';
      return sessionId;
    })
    .not.toBe('');
  await page.close();

  await expect
    .poll(async () => {
      const result = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as {
        sessions: readonly (SessionSummary & { status: string })[];
      };
      return result.sessions.find((item) => item.id === sessionId)?.status;
    })
    .toBe('completed');
  const archived = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
  ).json()) as StoredSession;
  const environment = archived?.participants?.[0]?.environment;
  expect(environment).toMatchObject({
    browser: expect.any(String),
    browserVersion: expect.any(String),
    engine: expect.any(String),
    userAgent: expect.any(String),
    viewport: expect.objectContaining({
      width: expect.any(Number),
      height: expect.any(Number),
    }),
    devicePixelRatio: expect.any(Number),
    language: expect.any(String),
    timeZone: expect.any(String),
  });
  expect(archived?.participants?.[0]?.status).toBe('completed');
  await context.close();
});

test('confirms before deleting an archived session', async ({
  browser,
  request,
}) => {
  const existing = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
  ).json()) as { sessions: readonly SessionSummary[] };
  const existingIds = new Set(existing.sessions.map((item) => item.id));
  const context = await browser.newContext();
  const demo = await context.newPage();
  await demo.goto(`${DEMO_ORIGIN}/`);
  await demo.getByRole('button', { name: 'Add a user' }).click();

  let sessionId = '';
  await expect
    .poll(async () => {
      const result = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as { sessions: readonly SessionSummary[] };
      sessionId =
        result.sessions.find((item) => !existingIds.has(item.id))?.id ?? '';
      return sessionId;
    })
    .not.toBe('');
  await demo.close();

  const dashboard = await context.newPage();
  await dashboard.goto(DASHBOARD_ORIGIN);
  const deleteButton = dashboard.getByRole('button', {
    name: `Supprimer la session ${sessionId}`,
  });
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();
  const confirmation = dashboard.getByRole('group', {
    name: 'Confirmer la suppression de la session',
  });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Annuler' }).click();
  await expect(confirmation).toBeHidden();
  await expect(deleteButton).toBeVisible();
  expect(
    (
      await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
    ).status(),
  ).toBe(200);

  await deleteButton.click();
  await confirmation
    .getByRole('button', { name: 'Supprimer définitivement' })
    .click();
  await expect(deleteButton).toHaveCount(0);
  await expect
    .poll(() =>
      request
        .get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
        .then((response) => response.status()),
    )
    .toBe(404);
  await context.close();
});

test('automatically groups same-origin tabs and keeps an inactive tab attached', async ({
  browser,
  request,
}) => {
  const before = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
  const previousIds = new Set(
    (
      (await before.json()) as { sessions: readonly SessionSummary[] }
    ).sessions.map((item) => item.id),
  );
  const context = await browser.newContext();
  const firstTab = await context.newPage();
  const secondTab = await context.newPage();

  await firstTab.goto(`${DEMO_ORIGIN}/`);
  await expect(
    firstTab.getByRole('heading', { name: 'Functional SFC components' }),
  ).toBeVisible();
  await secondTab.goto(`${DEMO_ORIGIN}/`);
  await expect(
    secondTab.getByRole('heading', { name: 'Functional SFC components' }),
  ).toBeVisible();
  await firstTab.getByRole('button', { name: 'Add a user' }).click();
  await secondTab.getByRole('button', { name: 'Add a user' }).click();

  let sessionId = '';
  await expect
    .poll(async () => {
      const result = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as { sessions: readonly SessionSummary[] };
      sessionId =
        result.sessions.find((item) => !previousIds.has(item.id))?.id ?? '';
      return sessionId;
    })
    .not.toBe('');

  let stored: StoredSession | undefined;
  await expect
    .poll(async () => {
      stored = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
      ).json()) as StoredSession;
      return new Set(
        stored.events
          .filter((event) => event.kind === 'dom' && event.phase === 'emitted')
          .map((event) => event.participantId),
      ).size;
    })
    .toBe(2);
  expect(stored?.participants).toHaveLength(2);
  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  const participantSelector = dashboard.getByLabel('Onglets à visionner');
  await expect(participantSelector).toBeVisible();
  await expect(participantSelector).toHaveValue('all');
  await expect(
    dashboard.locator('iframe[data-replay-participant]'),
  ).toHaveCount(2);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    '1 /',
  );

  await secondTab.evaluate(() => {
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => false,
    });
    window.dispatchEvent(new Event('blur'));
  });
  await expect
    .poll(() =>
      request
        .get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
        .then((response) => response.json() as Promise<StoredSession>)
        .then((session) =>
          session.events.some(
            (event) =>
              event.kind === 'participant' &&
              event.name === 'state' &&
              event.participantId !== undefined &&
              event.payload?.['state'] === 'blurred',
          ),
        ),
    )
    .toBe(true);
  const afterBlur = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
  ).json()) as StoredSession;
  const eventsAfterBlur = afterBlur.events.length;
  await secondTab.waitForTimeout(1_200);
  const afterIdle = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
  ).json()) as StoredSession;
  expect(afterIdle.events).toHaveLength(eventsAfterBlur);
  expect(
    afterIdle.participants?.some(
      (participant) => participant.state === 'blurred',
    ),
  ).toBe(true);

  await secondTab.evaluate(() => {
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => true,
    });
    window.dispatchEvent(new Event('focus'));
  });
  await secondTab.getByRole('button', { name: 'Add a user' }).click();
  await expect
    .poll(async () => {
      const response = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
      ).json()) as StoredSession;
      return response.events.filter(
        (event) => event.kind === 'dom' && event.phase === 'emitted',
      ).length;
    })
    .toBe(3);

  await context.close();
});

test('switches the visible replay iframe when the recorded active tab changes', async ({
  browser,
  browserName,
}) => {
  const context = await browser.newContext();
  const dashboard = await context.newPage();
  await dashboard.goto(DASHBOARD_ORIGIN);
  const sessionId = await dashboard.evaluate(
    async ({ sessionServerOrigin, demoOrigin, browserName }) => {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const base = Date.parse(createdAt);
      const action = (
        participantId: string,
        sequence: number,
        offset: number,
      ) => ({
        id: `${participantId}-action`,
        sequence,
        timestamp: base + offset,
        elapsedMs: offset,
        kind: 'dom',
        phase: 'emitted',
        payload: {
          selector: 'button[data-testid="add-user"]',
          action: 'click',
        },
      });
      const state = (
        participantId: string,
        sequence: number,
        value: 'visible' | 'hidden' | 'blurred',
        offset: number,
        initial = false,
      ) => ({
        id: `${participantId}-state-${sequence}`,
        sequence,
        timestamp: base + offset,
        elapsedMs: offset,
        kind: 'participant',
        phase: 'emitted',
        name: 'state',
        payload: { state: value, ...(initial ? { initial: true } : {}) },
      });
      const sendSync = (
        participantId: string,
        title: string,
        participantEvents: readonly Record<string, unknown>[],
        participantState: 'visible' | 'hidden',
      ) => ({
        type: 'session:sync',
        id,
        participantId,
        createdAt,
        participant: {
          title,
          state: participantState,
          viewport: { width: 1280, height: 800 },
          environment:
            browserName === 'webkit'
              ? {
                  browser: 'Firefox',
                  browserVersion: '128.0',
                  engine: 'gecko',
                  userAgent: 'Mozilla/5.0 Firefox/128.0',
                  platform: 'MacIntel',
                }
              : {
                  browser: 'Safari',
                  browserVersion: '18.0',
                  engine: 'webkit',
                  userAgent: 'Mozilla/5.0 Version/18.0 Safari/605.1.15',
                  platform: 'MacIntel',
                },
        },
        session: {
          format: 'craft-debug-session',
          version: 2,
          startUrl: `${demoOrigin}/`,
          exportedAt: base,
          viewport: { width: 1280, height: 800 },
          truncated: false,
          events: participantEvents,
          clips: [],
        },
      });

      return await new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(
          `${sessionServerOrigin.replace(/^http/, 'ws')}/sessions/ws`,
        );
        let participantIndex = 0;
        socket.addEventListener('open', () => {
          socket.send(
            JSON.stringify(
              sendSync(
                'tab-a',
                'Fenêtre A',
                [
                  state('tab-a', 1, 'visible', 0, true),
                  action('tab-a', 2, 100),
                  state('tab-a', 3, 'blurred', 600),
                ],
                'visible',
              ),
            ),
          );
        });
        socket.addEventListener('message', (event) => {
          const message = JSON.parse(String(event.data)) as {
            type?: string;
            message?: string;
          };
          if (message.type === 'error') {
            socket.close();
            reject(new Error(message.message ?? 'Session sync failed'));
            return;
          }
          if (message.type !== 'session:ready') return;
          if (participantIndex++ === 0) {
            socket.send(
              JSON.stringify(
                sendSync(
                  'tab-b',
                  'Fenêtre B',
                  [
                    state('tab-b', 1, 'visible', 600, true),
                    action('tab-b', 2, 1_600),
                  ],
                  'visible',
                ),
              ),
            );
            return;
          }
          socket.close();
          resolve(id);
        });
        socket.addEventListener('error', () =>
          reject(new Error('Session server WebSocket connection failed')),
        );
      });
    },
    {
      sessionServerOrigin: SESSION_SERVER_ORIGIN,
      demoOrigin: DEMO_ORIGIN,
      browserName,
    },
  );

  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  await expect(
    dashboard.locator('[data-lab="environment-warning"]'),
  ).toContainText('Environnement différent de l’enregistrement');
  await expect(
    dashboard.locator('iframe[data-replay-participant]'),
  ).toHaveCount(2);
  const lateFrame = dashboard.locator(
    'iframe[data-replay-participant="tab-b"]',
  );
  await expect(lateFrame).not.toHaveAttribute('src', /localhost/);
  await expect(
    dashboard.locator('[data-tile-focus="true"] [data-lab="replay-tile-name"]'),
  ).toHaveText('Fenêtre A');
  await expect(
    dashboard.locator(
      '[data-tile-focus="true"] [data-lab="replay-active-badge"]',
    ),
  ).toHaveText('ACTIF');
  await expect(
    dashboard.locator('#replay-frame-placeholder-tab-b'),
  ).toContainText('s’ouvrira au moment enregistré');

  await dashboard
    .getByRole('button', { name: 'Lecture à vitesse réelle' })
    .click();
  await dashboard.waitForTimeout(250);
  await expect(lateFrame).not.toHaveAttribute('src', /localhost/);
  await expect(lateFrame).toHaveAttribute('src', /localhost/, {
    timeout: 1_500,
  });
  await expect(
    dashboard.locator('[data-tile-focus="true"] [data-lab="replay-tile-name"]'),
  ).toHaveText('Fenêtre B', { timeout: 1_500 });
  await expect(
    dashboard.locator(
      '[data-tile-focus="true"] [data-lab="replay-active-badge"]',
    ),
  ).toHaveText('ACTIF');
  await expect(
    dashboard.locator('[data-lab="replay-tile"]:not([hidden])'),
  ).toHaveCount(2);
  await context.close();
});

test('dims replay tabs recorded as hidden while keeping them in the all-tabs view', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const dashboard = await context.newPage();
  await dashboard.goto(DASHBOARD_ORIGIN);
  const sessionId = await dashboard.evaluate(
    async ({ sessionServerOrigin, demoOrigin }) => {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const timestamp = Date.parse(createdAt);
      const stateEvent = (
        participantId: string,
        sequence: number,
        state: 'visible' | 'hidden',
      ) => ({
        id: `${participantId}-state-${sequence}`,
        sequence,
        timestamp,
        elapsedMs: 0,
        kind: 'participant',
        phase: 'emitted',
        name: 'state',
        payload: { state, initial: true },
      });
      const sendSync = (
        participantId: string,
        participantState: 'visible' | 'hidden',
        eventState: 'visible' | 'hidden',
      ) => ({
        type: 'session:sync',
        id,
        participantId,
        createdAt,
        participant: {
          title: participantId,
          state: participantState,
          viewport: { width: 1280, height: 800 },
        },
        session: {
          format: 'craft-debug-session',
          version: 2,
          startUrl: `${demoOrigin}/`,
          exportedAt: timestamp,
          viewport: { width: 1280, height: 800 },
          truncated: false,
          events: [stateEvent(participantId, 1, eventState)],
          clips: [],
        },
      });

      return await new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(
          `${sessionServerOrigin.replace(/^http/, 'ws')}/sessions/ws`,
        );
        let participantIndex = 0;
        socket.addEventListener('open', () => {
          socket.send(
            JSON.stringify(sendSync('hidden-tab', 'hidden', 'hidden')),
          );
        });
        socket.addEventListener('message', (event) => {
          const message = JSON.parse(String(event.data)) as {
            type?: string;
            message?: string;
          };
          if (message.type === 'error') {
            socket.close();
            reject(new Error(message.message ?? 'Session sync failed'));
            return;
          }
          if (message.type === 'session:saved') {
            resolve(id);
            return;
          }
          if (message.type !== 'session:ready') return;
          if (participantIndex++ === 0) {
            socket.send(
              JSON.stringify(sendSync('visible-tab', 'visible', 'visible')),
            );
            return;
          }
          socket.send(
            JSON.stringify({
              type: 'session:finish',
              id,
              participantId: 'visible-tab',
            }),
          );
        });
        socket.addEventListener('error', () =>
          reject(new Error('Session server WebSocket connection failed')),
        );
      });
    },
    { sessionServerOrigin: SESSION_SERVER_ORIGIN, demoOrigin: DEMO_ORIGIN },
  );

  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
    { timeout: 20_000 },
  );
  await expect(
    dashboard.locator('[data-lab="replay-tile"]:not([hidden])'),
  ).toHaveCount(2);
  const hiddenOverlay = dashboard.locator(
    '#replay-frame-card-hidden-tab [data-lab="replay-visibility-overlay"]',
  );
  await expect(hiddenOverlay).toBeVisible();
  await expect(hiddenOverlay).toHaveText('Non visible');
  const closedOverlay = dashboard.locator(
    '#replay-frame-card-visible-tab [data-lab="replay-visibility-overlay"]',
  );
  await expect(closedOverlay).toBeVisible();
  await expect(closedOverlay).toHaveText('Onglet fermé');
  await context.close();
});

test('opens a replay for a complete tab in a globally truncated session', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const dashboard = await context.newPage();
  await dashboard.goto(DASHBOARD_ORIGIN);
  const sessionId = await dashboard.evaluate(
    async ({ sessionServerOrigin, demoOrigin }) => {
      const id = crypto.randomUUID();
      const timestamp = Date.now();
      const sendSync = (
        participantId: string,
        events: readonly Record<string, unknown>[],
      ) => ({
        type: 'session:sync',
        id,
        participantId,
        createdAt: new Date(timestamp).toISOString(),
        participant: { title: participantId, state: 'visible' },
        session: {
          format: 'craft-debug-session',
          version: 2,
          startUrl: `${demoOrigin}/`,
          exportedAt: timestamp,
          truncated: participantId === 'truncated-tab',
          events,
          clips: [],
        },
      });
      const oldTabEvents = Array.from({ length: 501 }, (_, index) => ({
        id: `old-event-${index + 17}`,
        sequence: index + 17,
        timestamp: timestamp + index,
        elapsedMs: index,
        kind: 'craft',
        phase: 'started',
      }));
      const replayEvent = {
        id: 'complete-tab-action',
        sequence: 1,
        timestamp: timestamp + 502,
        elapsedMs: 0,
        kind: 'dom',
        phase: 'emitted',
        payload: { selector: 'button', action: 'click' },
      };

      return await new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(
          `${sessionServerOrigin.replace(/^http/, 'ws')}/sessions/ws`,
        );
        let participantIndex = 0;
        socket.addEventListener('open', () => {
          socket.send(JSON.stringify(sendSync('truncated-tab', oldTabEvents)));
        });
        socket.addEventListener('message', (event) => {
          const message = JSON.parse(String(event.data)) as {
            type?: string;
            message?: string;
          };
          if (message.type === 'error') {
            socket.close();
            reject(new Error(message.message ?? 'Session sync failed'));
            return;
          }
          if (message.type !== 'session:ready') return;
          if (participantIndex++ === 0) {
            socket.send(
              JSON.stringify(sendSync('complete-tab', [replayEvent])),
            );
            return;
          }
          socket.close();
          resolve(id);
        });
        socket.addEventListener('error', () =>
          reject(new Error('Session server WebSocket connection failed')),
        );
      });
    },
    { sessionServerOrigin: SESSION_SERVER_ORIGIN, demoOrigin: DEMO_ORIGIN },
  );

  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(dashboard.getByLabel('Onglets à visionner')).toHaveValue('all');
  await expect(dashboard.locator('[data-lab="left"]')).toContainText(
    'archive tronquée, onglets incomplets exclus du replay',
  );
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  await expect(
    dashboard.locator('iframe[data-replay-participant="complete-tab"]'),
  ).toHaveCount(1);
  await expect(
    dashboard.locator('iframe[data-replay-participant="truncated-tab"]'),
  ).toHaveCount(0);
  await expect(
    dashboard.locator(
      '[data-tile-focus="true"] [data-lab="replay-active-badge"]',
    ),
  ).toHaveCount(0);
  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(
    dashboard.locator(
      '[data-tile-action="true"] [data-lab="replay-active-badge"]',
    ),
  ).toHaveText('ACTION');
  await context.close();
});

test('keeps the shared session and earlier events when a tab reloads', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext();
  const tab = await context.newPage();
  await tab.goto(`${DEMO_ORIGIN}/`);
  await expect(
    tab.getByRole('heading', { name: 'Functional SFC components' }),
  ).toBeVisible();
  await tab.getByRole('button', { name: 'Add a user' }).click();

  let sessionId = '';
  await expect
    .poll(async () => {
      const response = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as { sessions: readonly SessionSummary[] };
      sessionId = response.sessions[0]?.id ?? '';
      return sessionId;
    })
    .not.toBe('');
  let eventCountBeforeReload = 0;
  await expect
    .poll(async () => {
      const session = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
      ).json()) as StoredSession;
      eventCountBeforeReload = session.events.filter(
        (event) => event.kind === 'dom' && event.phase === 'emitted',
      ).length;
      return eventCountBeforeReload;
    })
    .toBeGreaterThan(0);

  await tab.reload();
  await expect(
    tab.getByRole('heading', { name: 'Functional SFC components' }),
  ).toBeVisible();
  await tab.getByRole('button', { name: 'Add a user' }).click();
  await expect
    .poll(async () => {
      const sessions = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as { sessions: readonly SessionSummary[] };
      return sessions.sessions.filter((item) => item.id === sessionId).length;
    })
    .toBe(1);
  await expect
    .poll(async () => {
      const session = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
      ).json()) as StoredSession;
      return session.events.filter(
        (event) => event.kind === 'dom' && event.phase === 'emitted',
      ).length;
    })
    .toBeGreaterThan(eventCountBeforeReload);

  await context.close();
});

test('keeps unrelated browser profiles in separate automatic sessions', async ({
  browser,
  request,
}) => {
  const previous = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
  ).json()) as { sessions: readonly SessionSummary[] };
  const previousIds = new Set(previous.sessions.map((item) => item.id));
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstTab = await firstContext.newPage();
  const secondTab = await secondContext.newPage();
  await Promise.all([
    firstTab.goto(`${DEMO_ORIGIN}/`),
    secondTab.goto(`${DEMO_ORIGIN}/`),
  ]);
  await Promise.all([
    expect(
      firstTab.getByRole('heading', { name: 'Functional SFC components' }),
    ).toBeVisible(),
    expect(
      secondTab.getByRole('heading', { name: 'Functional SFC components' }),
    ).toBeVisible(),
  ]);
  await firstTab.getByRole('button', { name: 'Add a user' }).click();
  await secondTab.getByRole('button', { name: 'Add a user' }).click();

  const sessionIds = new Set<string>();
  await expect
    .poll(async () => {
      const response = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as { sessions: readonly SessionSummary[] };
      for (const session of response.sessions) {
        if (!previousIds.has(session.id)) sessionIds.add(session.id);
      }
      return sessionIds.size;
    })
    .toBe(2);

  const latest = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
  ).json()) as { sessions: readonly SessionSummary[] };
  expect(
    latest.sessions.filter((item) => sessionIds.has(item.id)),
  ).toHaveLength(2);
  await Promise.all([firstContext.close(), secondContext.close()]);
});

test('replays every recorded user action and targets the recorded user', async ({
  browser,
  request,
}) => {
  const before = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
  expect(before.ok()).toBeTruthy();
  const previousSessions = new Set(
    (
      (await before.json()) as { sessions: readonly SessionSummary[] }
    ).sessions.map((session) => session.id),
  );

  const context = await browser.newContext();
  const demo = await context.newPage();
  await demo.goto(`${DEMO_ORIGIN}/`);
  await expect(
    demo.getByRole('heading', { name: 'Functional SFC components' }),
  ).toBeVisible();
  await demo.getByRole('button', { name: 'Add a user' }).click();
  await demo.getByRole('button', { name: 'Add a user' }).click();
  await demo.getByRole('button', { name: 'Remove User 3' }).click();
  await demo.getByTestId('nav-toggle').click();
  await demo
    .getByTestId('nav-panel')
    .getByRole('link', { name: 'Type-safe i18n' })
    .click();
  await expect(demo).toHaveURL(`${DEMO_ORIGIN}/i18n`);

  let sessionId = '';
  await expect
    .poll(async () => {
      const response = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
      const sessions = (await response.json()) as {
        sessions: readonly SessionSummary[];
      };
      sessionId =
        sessions.sessions.find((session) => !previousSessions.has(session.id))
          ?.id ?? '';
      return sessionId;
    })
    .not.toBe('');

  let session: StoredSession | undefined;
  await expect
    .poll(async () => {
      const response = await request.get(
        `${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`,
      );
      if (!response.ok()) return 0;
      session = (await response.json()) as StoredSession;
      return session.events.filter(
        (event) => event.kind === 'dom' && event.phase === 'emitted',
      ).length;
    })
    .toBe(5);
  const interactions = session!.events.filter(
    (event) => event.kind === 'dom' && event.phase === 'emitted',
  );
  expect(interactions).toHaveLength(5);
  const removalSelector = String(interactions[2]?.payload?.['selector']);
  expect(removalSelector).toContain('[data-user-id=');
  expect(removalSelector).toContain('3');
  const navLinkSelector = String(interactions[4]?.payload?.['selector']);
  expect(navLinkSelector).toContain('[data-testid="nav-panel"]');
  expect(navLinkSelector).toContain('nth-of-type');
  expect(interactions[4]?.payload?.['href']).toBe(`${DEMO_ORIGIN}/i18n`);
  await demo.close();

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(dashboard.locator('[data-lab="left"]')).toContainText(
    `Format v2 · ${session.events.length} événements`,
  );
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  expect(session.viewport).toBeDefined();
  await expect(
    dashboard.locator('[data-lab="viewport-caption"]'),
  ).toContainText(
    `Viewport enregistré · ${session.viewport!.width} × ${session.viewport!.height} px`,
  );
  const replayFrame = dashboard.locator('#replay-target');
  const viewportFrame = dashboard.locator('#replay-viewport-frame');
  await expect(replayFrame).toHaveCSS('width', `${session.viewport!.width}px`);
  await expect(replayFrame).toHaveCSS(
    'height',
    `${session.viewport!.height}px`,
  );
  expect(
    await replayFrame.evaluate(
      (element) => getComputedStyle(element).transform,
    ),
  ).not.toBe('none');
  const frameBounds = await replayFrame.boundingBox();
  const visibleViewportBounds = await viewportFrame.boundingBox();
  expect(frameBounds).not.toBeNull();
  expect(visibleViewportBounds).not.toBeNull();
  expect(
    visibleViewportBounds!.width / visibleViewportBounds!.height,
  ).toBeCloseTo(session.viewport!.width / session.viewport!.height);
  expect(frameBounds!.width).toBeCloseTo(visibleViewportBounds!.width);
  expect(frameBounds!.height).toBeCloseTo(visibleViewportBounds!.height);
  for (const actionName of [
    'Lecture à vitesse réelle',
    'Pause',
    'Arrêter',
    'Plein écran',
    'Action suivante',
  ]) {
    await expect(
      dashboard.getByRole('button', { name: actionName }),
    ).toHaveAttribute('data-tooltip', /.+/);
  }

  const replayApp = dashboard.frameLocator('#replay-target');
  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    '1 / 5',
  );
  const clickMarker = dashboard.locator('#replay-click-marker');
  await expect(clickMarker).toBeVisible();
  const firstClick = interactions[0]?.payload;
  if (
    typeof firstClick?.['clientX'] === 'number' &&
    typeof firstClick['clientY'] === 'number'
  ) {
    const markerPosition = await clickMarker.evaluate((marker) => ({
      left: Number.parseFloat(marker.style.left),
      top: Number.parseFloat(marker.style.top),
    }));
    const scale = visibleViewportBounds!.width / session.viewport!.width;
    expect(markerPosition.left).toBeCloseTo(firstClick['clientX'] * scale);
    expect(markerPosition.top).toBeCloseTo(firstClick['clientY'] * scale);
  }
  await expect(replayApp.locator('[data-user-id="3"]')).toBeVisible();
  const secondInteraction = interactions[1];
  await expect(
    dashboard.locator('[data-lab="next-action-name"]'),
  ).toContainText(secondInteraction?.name ?? 'nom non disponible');

  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    '2 / 5',
  );
  await expect(replayApp.locator('[data-user-id="4"]')).toBeVisible();

  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    '3 / 5',
  );
  await expect(replayApp.locator('[data-user-id="3"]')).toHaveCount(0);
  await expect(replayApp.locator('[data-user-id="4"]')).toBeVisible();

  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    '4 / 5',
  );
  await expect(replayApp.getByTestId('nav-panel')).toBeVisible();

  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    '5 / 5',
  );
  await expect
    .poll(async () =>
      dashboard
        .frames()
        .find((frame) => frame.url().startsWith(`${DEMO_ORIGIN}`))
        ?.url(),
    )
    .toBe(`${DEMO_ORIGIN}/i18n`);

  await expect(
    dashboard.getByRole('button', { name: 'Lecture à vitesse réelle' }),
  ).toBeDisabled();
  await expect(
    dashboard.getByRole('button', { name: 'Action suivante' }),
  ).toBeDisabled();
  await expect(
    dashboard.getByRole('button', { name: 'Arrêter' }),
  ).toBeDisabled();
  await openDetails(dashboard);
  await expect(
    dashboard.getByRole('button', { name: 'Exporter la cible' }),
  ).toHaveAttribute('data-tooltip', /session de diagnostic/);

  await expect(
    dashboard.getByRole('button', { name: 'Préparer le replay' }),
  ).toHaveCount(0);
  await dashboard.reload();
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  await dashboard
    .getByRole('button', { name: 'Lecture à vitesse réelle' })
    .click();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    '5 / 5 étapes · terminé',
  );
  await expect
    .poll(async () =>
      dashboard
        .frames()
        .find((frame) => frame.url().startsWith(`${DEMO_ORIGIN}`))
        ?.url(),
    )
    .toBe(`${DEMO_ORIGIN}/i18n`);

  const afterReplay = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
  const archivedIds = (
    (await afterReplay.json()) as { sessions: readonly SessionSummary[] }
  ).sessions.map((session) => session.id);
  expect(new Set(archivedIds)).toEqual(
    new Set([...previousSessions, sessionId]),
  );

  await context.close();
});

test('forces the recorded link destination after a replay divergence', async ({
  browser,
  request,
}) => {
  const before = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
  const previousSessions = new Set(
    (
      (await before.json()) as { sessions: readonly SessionSummary[] }
    ).sessions.map((session) => session.id),
  );
  const context = await browser.newContext();
  const demo = await context.newPage();
  await demo.goto(`${DEMO_ORIGIN}/`);
  await expect(
    demo.getByRole('heading', { name: 'Functional SFC components' }),
  ).toBeVisible();
  await demo.getByTestId('nav-toggle').click();
  await demo
    .getByTestId('nav-panel')
    .getByRole('link', { name: 'Pending Block', exact: true })
    .waitFor({ state: 'visible' });
  const recordedQueryStart = Date.now();
  await demo
    .getByTestId('nav-panel')
    .getByRole('link', { name: 'Pending Block', exact: true })
    .click();
  await expect(demo).toHaveURL(`${DEMO_ORIGIN}/pending-node`);
  await expect(demo.getByText('3 people')).toBeVisible();
  expect(Date.now() - recordedQueryStart).toBeGreaterThanOrEqual(800);
  await demo.getByTestId('nav-toggle').click();
  await expect(demo.getByTestId('nav-panel')).toBeVisible();

  let sessionId = '';
  await expect
    .poll(async () => {
      const response = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
      const sessions = (await response.json()) as {
        sessions: readonly SessionSummary[];
      };
      sessionId =
        sessions.sessions.find((session) => !previousSessions.has(session.id))
          ?.id ?? '';
      return sessionId;
    })
    .not.toBe('');
  await expect
    .poll(async () => {
      const response = await request.get(
        `${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`,
      );
      if (!response.ok()) return 0;
      const stored = (await response.json()) as StoredSession;
      return stored.events.filter(
        (event) => event.kind === 'dom' && event.phase === 'emitted',
      ).length;
    })
    .toBe(3);
  const storedResponse = await request.get(
    `${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`,
  );
  const session = (await storedResponse.json()) as {
    events: Array<{
      id: string;
      sequence: number;
      timestamp: number;
      kind: string;
      phase: string;
      payload?: Record<string, unknown>;
      state?: unknown;
    }>;
    [key: string]: unknown;
  };
  const recordedEvents = session.events;
  const recordedLink = recordedEvents.find(
    (event) =>
      event.kind === 'dom' &&
      event.phase === 'emitted' &&
      String(event.payload?.['href']).endsWith('/pending-node'),
  );
  expect(recordedLink).toBeDefined();
  recordedLink!.payload!['selector'] =
    '[data-testid="nav-panel"] a[href="/i18n"]';
  const afterNavigationInteraction = recordedEvents
    .filter((event) => event.kind === 'dom' && event.phase === 'emitted')
    .at(-1)!;
  const checkpointSequence = afterNavigationInteraction.sequence;
  for (const event of recordedEvents) {
    if (event.sequence >= checkpointSequence) event.sequence += 1;
  }
  recordedEvents.push({
    id: 'forced-recovery-checkpoint',
    sequence: checkpointSequence,
    timestamp: afterNavigationInteraction.timestamp,
    kind: 'primitive',
    phase: 'emitted',
    payload: { name: 'forced-recovery-checkpoint' },
    state: { forcedRecoveryProbe: true },
  });
  recordedEvents.sort((left, right) => left.sequence - right.sequence);
  await demo.close();

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/`);
  await dashboard.getByRole('button', { name: 'Importer un fichier' }).click();
  await dashboard
    .getByRole('textbox', { name: 'Session JSON' })
    .fill(JSON.stringify(session));
  await dashboard.getByRole('button', { name: 'Valider la session' }).click();
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(
    dashboard.getByRole('button', { name: 'Préparer le replay' }),
  ).toHaveCount(0);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  const replayApp = dashboard.frameLocator('#replay-target');
  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(dashboard.locator('[data-lab="diff"]')).toBeVisible();
  const force = dashboard.getByRole('button', {
    name: 'Forcer l’état attendu et continuer',
  });
  await expect(force).toBeVisible();
  await force.click();
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Reprise forcée · navigation vers /pending-node',
  );
  await expect
    .poll(async () =>
      dashboard
        .frames()
        .find((frame) => frame.url().startsWith(`${DEMO_ORIGIN}`))
        ?.url(),
    )
    .toBe(`${DEMO_ORIGIN}/pending-node`);
  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    '3 / 3',
  );
  await expect(replayApp.getByTestId('nav-panel')).toBeVisible();

  await context.close();
});

test('replays a pending-block route through its delayed Craft query', async ({
  browser,
  request,
}) => {
  const before = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
  const previousSessions = new Set(
    (
      (await before.json()) as { sessions: readonly SessionSummary[] }
    ).sessions.map((session) => session.id),
  );
  const context = await browser.newContext();
  const demo = await context.newPage();
  await demo.goto(`${DEMO_ORIGIN}/`);
  await expect(
    demo.getByRole('heading', { name: 'Functional SFC components' }),
  ).toBeVisible();
  await demo.getByTestId('nav-toggle').click();
  await demo
    .getByTestId('nav-panel')
    .getByRole('link', { name: 'Pending Block', exact: true })
    .click();
  await expect(demo).toHaveURL(`${DEMO_ORIGIN}/pending-node`);
  await expect(demo.getByText('3 people')).toBeVisible();

  let sessionId = '';
  await expect
    .poll(async () => {
      const response = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
      const sessions = (await response.json()) as {
        sessions: readonly SessionSummary[];
      };
      sessionId =
        sessions.sessions.find((session) => !previousSessions.has(session.id))
          ?.id ?? '';
      return sessionId;
    })
    .not.toBe('');

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(
    dashboard.getByRole('button', { name: 'Préparer le replay' }),
  ).toHaveCount(0);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );

  const replayApp = dashboard.frameLocator('#replay-target');
  const replayStartedAt = Date.now();
  await dashboard
    .getByRole('button', { name: 'Lecture à vitesse réelle' })
    .click();
  await expect(
    replayApp.getByRole('heading', { name: 'settledValue + pendingNode' }),
  ).toBeVisible();
  await expect(replayApp.getByText('Loading teams…')).toBeVisible();
  await expect(replayApp.getByText('3 people')).toBeVisible();
  expect(Date.now() - replayStartedAt).toBeGreaterThanOrEqual(800);
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    '2 / 2 étapes · terminé',
  );
  await expect(dashboard.locator('[data-lab="diff"]')).toBeHidden();

  await context.close();
});

test('skips a divergent interval to a compatible checkpoint and marks the replay partial', async ({
  browser,
  request,
}) => {
  const before = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
  const previousSessions = new Set(
    (
      (await before.json()) as { sessions: readonly SessionSummary[] }
    ).sessions.map((session) => session.id),
  );
  const context = await browser.newContext();
  const demo = await context.newPage();
  await demo.goto(`${DEMO_ORIGIN}/`);
  await expect(
    demo.getByRole('heading', { name: 'Functional SFC components' }),
  ).toBeVisible();
  await demo.getByRole('button', { name: 'Add a user' }).click();
  await demo.getByRole('button', { name: 'Add a user' }).click();
  await demo.getByRole('button', { name: 'Add a user' }).click();

  let sessionId = '';
  await expect
    .poll(async () => {
      const response = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
      const sessions = (await response.json()) as {
        sessions: readonly SessionSummary[];
      };
      sessionId =
        sessions.sessions.find((session) => !previousSessions.has(session.id))
          ?.id ?? '';
      return sessionId;
    })
    .not.toBe('');
  let recording:
    | {
        events: Array<{
          id: string;
          sequence: number;
          timestamp: number;
          kind: string;
          phase: string;
          payload?: Record<string, unknown>;
          state?: unknown;
        }>;
        initialSnapshot?: Record<string, unknown>;
        [key: string]: unknown;
      }
    | undefined;
  await expect
    .poll(async () => {
      const response = await request.get(
        `${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`,
      );
      if (!response.ok()) return 0;
      recording = (await response.json()) as typeof recording;
      return (
        recording?.events.filter(
          (event) => event.kind === 'dom' && event.phase === 'emitted',
        ).length ?? 0
      );
    })
    .toBe(3);

  const initialState = recording!.initialSnapshot;
  expect(initialState).toBeDefined();
  const stateKeys = Object.keys(initialState ?? {});
  expect(stateKeys.length).toBeGreaterThan(0);
  const divergentState = { ...initialState, [stateKeys[0]!]: '__divergent__' };
  const events = recording!.events.filter(
    (event) => event.kind !== 'primitive' && event.kind !== 'snapshot',
  );
  const userInteractions = events.filter(
    (event) => event.kind === 'dom' && event.phase === 'emitted',
  );
  const instrumentedEvents: typeof events = [];
  let domCount = 0;
  for (const event of events) {
    if (event === userInteractions[2]) {
      instrumentedEvents.push({
        id: 'resume-checkpoint',
        sequence: 0,
        timestamp: event.timestamp,
        kind: 'snapshot',
        phase: 'emitted',
        state: initialState,
      });
    }
    instrumentedEvents.push(event);
    if (event === userInteractions[0]) {
      instrumentedEvents.push({
        id: 'forced-divergence',
        sequence: 0,
        timestamp: event.timestamp,
        kind: 'primitive',
        phase: 'emitted',
        state: divergentState,
      });
    }
    if (event === userInteractions[2]) {
      instrumentedEvents.push({
        id: 'divergence-after-recovery',
        sequence: 0,
        timestamp: event.timestamp,
        kind: 'primitive',
        phase: 'emitted',
        state: divergentState,
      });
    }
    if (event.kind === 'dom' && event.phase === 'emitted') domCount += 1;
  }
  expect(domCount).toBe(3);
  instrumentedEvents.forEach((event, index) => {
    event.sequence = index + 1;
  });
  recording!.events = instrumentedEvents;
  await demo.close();

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/`);
  await dashboard
    .getByRole('textbox', { name: 'Session JSON' })
    .fill(JSON.stringify(recording));
  await dashboard.getByRole('button', { name: 'Valider la session' }).click();
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(
    dashboard.getByRole('button', { name: 'Préparer le replay' }),
  ).toHaveCount(0);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(dashboard.locator('[data-lab="diff"]')).toBeVisible();

  const skip = dashboard.getByRole('button', {
    name: 'Ignorer jusqu’au prochain point de reprise',
  });
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay partiel · intervalle 1–2 ignoré',
  );
  await expect(dashboard.locator('[data-lab="partial"]')).toContainText(
    'checkpoint resume-checkpoint',
  );
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    '2 / 3',
  );

  const replayApp = dashboard.frameLocator('#replay-target');
  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(dashboard.locator('[data-lab="diff"]')).toBeVisible();
  await expect(replayApp.locator('[data-user-id="3"]')).toBeVisible();
  await expect(dashboard.locator('[data-lab="partial"]')).toContainText(
    'Replay partiel',
  );

  await context.close();
});

test('captures a clicked link destination while redacting secret query values', async ({
  browser,
  request,
}) => {
  const before = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
  const previousSessions = new Set(
    (
      (await before.json()) as { sessions: readonly SessionSummary[] }
    ).sessions.map((session) => session.id),
  );
  const context = await browser.newContext();
  const demo = await context.newPage();
  await demo.goto(`${DEMO_ORIGIN}/`);
  await expect(
    demo.getByRole('heading', { name: 'Functional SFC components' }),
  ).toBeVisible();
  await demo.getByTestId('nav-toggle').click();
  const link = demo
    .getByTestId('nav-panel')
    .getByRole('link', { name: 'Type-safe i18n' });
  await link.evaluate((anchor) => {
    const target = '/i18n?token=top-secret-value&safe=kept';
    anchor.setAttribute('href', target);
    anchor.addEventListener(
      'click',
      () => anchor.setAttribute('href', target),
      { capture: true, once: true },
    );
    anchor.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
  });

  let sessionId = '';
  await expect
    .poll(async () => {
      const response = await request.get(`${SESSION_SERVER_ORIGIN}/sessions`);
      const sessions = (await response.json()) as {
        sessions: readonly SessionSummary[];
      };
      sessionId =
        sessions.sessions.find((session) => !previousSessions.has(session.id))
          ?.id ?? '';
      return sessionId;
    })
    .not.toBe('');
  let recorded: StoredSession | undefined;
  await expect
    .poll(async () => {
      const response = await request.get(
        `${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`,
      );
      if (!response.ok()) return false;
      recorded = (await response.json()) as StoredSession;
      return recorded.events.some(
        (event) =>
          event.kind === 'dom' &&
          event.phase === 'emitted' &&
          typeof event.payload?.['href'] === 'string',
      );
    })
    .toBe(true);
  const capturedLink = recorded!.events.find(
    (event) =>
      event.kind === 'dom' &&
      event.phase === 'emitted' &&
      typeof event.payload?.['href'] === 'string',
  )!;
  const capturedUrl = new URL(String(capturedLink.payload?.['href']));
  expect(capturedUrl.pathname).toBe('/i18n');
  expect(capturedUrl.searchParams.get('token')).toBe('[REDACTED]');
  expect(capturedUrl.searchParams.get('safe')).toBe('kept');
  expect(JSON.stringify(capturedLink)).not.toContain('top-secret-value');

  await context.close();
});
