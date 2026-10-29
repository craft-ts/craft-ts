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
  version?: number;
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
    sequence: number;
    kind: string;
    phase: string;
    operationId?: string;
    participantId?: string;
    name?: string;
    payload?: Readonly<Record<string, unknown>>;
    response?: unknown;
    state?: unknown;
  }>[];
}>;

function isRecordedApplicationInteraction(
  event: StoredSession['events'][number],
): boolean {
  return (
    event.kind === 'dom' &&
    event.phase === 'emitted' &&
    event.payload?.['action'] !== 'pointerdown' &&
    typeof event.payload?.['interactionName'] === 'string'
  );
}

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

test('opens an archived replay after the frame grid mounts and ignores Vite HMR coverage diagnostics', async ({
  page,
}) => {
  const sessionId = '810978c1-a911-42b1-bc5c-75142723adb3';
  const recordedAt = Date.now();
  await page.route(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`, (route) =>
    route.fulfill({
      json: {
        format: 'craft-debug-session',
        version: 8,
        transportEventVersion: 1,
        startUrl: `${DEMO_ORIGIN}/`,
        exportedAt: recordedAt + 1,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'vite-hmr-coverage',
            sequence: 1,
            timestamp: recordedAt,
            elapsedMs: 0,
            kind: 'transport',
            phase: 'failed',
            name: 'network-coverage:websocket',
            payload: { api: 'websocket', reason: 'no-matching-adapter' },
          },
          {
            id: 'recorded-add-user-click',
            sequence: 2,
            timestamp: recordedAt + 1,
            elapsedMs: 1,
            kind: 'dom',
            phase: 'emitted',
            payload: {
              selector: '[data-testid="add-user"]',
              action: 'click',
              interactionName: 'button:add-user',
            },
          },
        ],
      },
    }),
  );

  await page.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(page.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(page.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  await expect(page.locator('#replay-target')).toBeAttached();

  await page.getByRole('button', { name: 'Lecture à vitesse réelle' }).click();
  await expect(page.locator('[data-lab="replay-progress"]')).toContainText(
    /1 \/ 1 étapes · terminé/,
  );
});

test('thumbnail worker keeps playback on the recorded timeline', async ({
  page,
}) => {
  const sessionId = '810978c1-a911-42b1-bc5c-75142723adb5';
  const recordedAt = Date.now();
  await page.route(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`, (route) =>
    route.fulfill({
      json: {
        format: 'craft-debug-session',
        version: 8,
        transportEventVersion: 1,
        startUrl: `${DEMO_ORIGIN}/`,
        exportedAt: recordedAt,
        truncated: false,
        clips: [],
        events: [0, 5_000].map((elapsedMs, index) => ({
          id: `recorded-add-user-${index}`,
          sequence: index + 1,
          timestamp: recordedAt + elapsedMs,
          elapsedMs,
          globalElapsedMs: elapsedMs,
          kind: 'dom',
          phase: 'emitted',
          participantId: 'thumbnail-worker-participant',
          payload: {
            selector: '[data-testid="add-user"]',
            action: 'click',
            interactionName: `button:add-user:${index}`,
          },
        })),
        participants: [
          {
            id: 'thumbnail-worker-participant',
            title: 'Demo',
            startUrl: `${DEMO_ORIGIN}/`,
            state: 'visible',
            status: 'completed',
            createdAt: new Date(recordedAt).toISOString(),
            updatedAt: new Date(recordedAt).toISOString(),
          },
        ],
      },
    }),
  );

  await page.goto(
    `${DASHBOARD_ORIGIN}/?replay-worker=1#/sessions/${sessionId}`,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as {
            __craftReplayWorker?: {
              snapshot(): { ready: boolean };
            };
          }).__craftReplayWorker?.snapshot().ready ?? false,
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    (window as unknown as {
      __craftReplayWorker: { advanceTo(index: number): void };
    }).__craftReplayWorker.advanceTo(2),
  );

  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as {
          __craftReplayWorker: {
            snapshot(): { replayIndex: number; state: string; seeking: boolean };
          };
        }).__craftReplayWorker.snapshot(),
      ),
    )
    .toMatchObject({ replayIndex: 1, state: 'playing', seeking: false });
});

test('opens a dedicated app tab and copies a request-bound guided-resume prompt', async ({
  page,
}) => {
  const sessionId = '810978c1-a911-42b1-bc5c-75142723adb4';
  const participantId = 'recorded-app-tab';
  const recordedAt = Date.now();
  let postedRequest: Record<string, unknown> | undefined;
  await page.route(`${SESSION_SERVER_ORIGIN}/sessions`, (route) =>
    route.fulfill({
      json: { sessions: [], retentionDays: 30, storageBytes: 0 },
    }),
  );
  await page.route(`${SESSION_SERVER_ORIGIN}/sessions/checkpoints**`, (route) =>
    route.fulfill({
      json: {
        checkpoints: [
          {
            id: '1a2c4b77-cd17-4bc2-8705-dd578ee88e20',
            sessionId,
            beforeSequence: 7,
            origin: DEMO_ORIGIN,
            route: '/',
            expired: false,
            expiresAt: new Date(recordedAt + 60_000).toISOString(),
            ttlReason: 'Pour cette session de test.',
          },
        ],
      },
    }),
  );
  await page.route(`${SESSION_SERVER_ORIGIN}/sessions/recipes**`, (route) =>
    route.fulfill({
      json: {
        recipes: [
          {
            id: '87f64a26-224d-49c5-a25e-6ec561b0c142',
            sessionId,
            beforeSequence: 7,
            origin: DEMO_ORIGIN,
            objective: { goal: 'Rejouer ce parcours.' },
            strategy: 'autonomous',
            updatedAt: new Date(recordedAt).toISOString(),
            runs: [],
          },
        ],
      },
    }),
  );
  await page.route(
    `${SESSION_SERVER_ORIGIN}/sessions/resume-requests`,
    async (route) => {
      postedRequest = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        json: {
          request: {
            ...postedRequest,
            createdAt: new Date(recordedAt).toISOString(),
          },
        },
      });
    },
  );
  await page.route(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`, (route) =>
    route.fulfill({
      json: {
        format: 'craft-debug-session',
        version: 8,
        transportEventVersion: 1,
        startUrl: `${DEMO_ORIGIN}/`,
        exportedAt: recordedAt,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'resume-point-event',
            sequence: 7,
            timestamp: recordedAt,
            elapsedMs: 0,
            kind: 'dom',
            phase: 'emitted',
            participantId,
            payload: {
              selector: '[data-testid="add-user"]',
              action: 'click',
              interactionName: 'button:add-user',
            },
          },
        ],
        participants: [
          {
            id: participantId,
            title: 'Application',
            startUrl: `${DEMO_ORIGIN}/`,
            state: 'visible',
            status: 'completed',
            createdAt: new Date(recordedAt).toISOString(),
            updatedAt: new Date(recordedAt).toISOString(),
          },
        ],
      },
    }),
  );

  await page.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(page.locator('[data-lab="detail-page"]')).toBeVisible();
  const openedPage = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Reprendre ici' }).click();
  const appTab = await openedPage;
  await expect(appTab).toHaveURL(/craft-resume-request=[0-9a-f-]{36}/);
  expect(
    new URL(await appTab.url()).searchParams.has('craft-debug-replay'),
  ).toBe(false);
  await expect(page.locator('[data-lab="resume-requested"]')).toBeVisible();
  await expect(page.locator('[data-lab="resume-prompt"]')).toContainText(
    /resume\.request\(requestId:/,
  );
  await expect(
    page.getByRole('button', { name: 'Copier le prompt' }),
  ).toBeVisible();
  await expect
    .poll(() => postedRequest)
    .toMatchObject({
      sessionId,
      beforeSequence: 7,
      participantId,
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  const requestId = String(postedRequest?.['id']);
  expect(
    new URL(await appTab.url()).searchParams.get('craft-resume-request'),
  ).toBe(requestId);
  await expect(page.locator('[data-lab="resume-prompt"]')).toContainText(
    requestId,
  );
  await appTab.close();
});

test('restores browser storage before the replay application boots', async ({
  browser,
  browserName,
  request,
}) => {
  test.skip(browserName !== 'chromium', 'IndexedDB enumeration is required.');
  const localKey = `replay-local-${Date.now()}`;
  // Keep this a non-secret storage key. Keys containing "session" are
  // intentionally redacted together with their values in portable archives.
  const sessionKey = `replay-state-${Date.now()}`;
  const cookieName = `replay_cookie_${Date.now()}`;
  const databaseName = `replay-storage-${Date.now()}`;
  const before = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
  ).json()) as { sessions: readonly SessionSummary[] };
  const previousIds = new Set(before.sessions.map((item) => item.id));
  const context = await browser.newContext();
  await context.addInitScript(
    ({ localKey, sessionKey, cookieName, databaseName }) => {
      const readBootState = async () => {
        const cookie = document.cookie
          .split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith(`${cookieName}=`));
        const local = localStorage.getItem(localKey);
        const session = sessionStorage.getItem(sessionKey);
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const open = indexedDB.open(databaseName, 1);
          open.onupgradeneeded = () => open.result.createObjectStore('values');
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
        });
        try {
          const idbValue = await new Promise<unknown>((resolve, reject) => {
            const request = database
              .transaction('values', 'readonly')
              .objectStore('values')
              .get('state');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          return {
            local,
            session,
            cookie: cookie?.slice(cookieName.length + 1) ?? null,
            indexedDb: idbValue ?? null,
          };
        } finally {
          database.close();
        }
      };
      Object.defineProperty(window, '__replayBrowserStorageBoot', {
        configurable: true,
        value: readBootState(),
      });
    },
    { localKey, sessionKey, cookieName, databaseName },
  );

  const demo = await context.newPage();
  const seedPageUrl = `${DEMO_ORIGIN}/__replay-storage-seed`;
  await context.route(seedPageUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Replay storage seed</title>',
    }),
  );
  await demo.goto(seedPageUrl);
  await demo.evaluate(
    async ({ localKey, sessionKey, cookieName, databaseName }) => {
      localStorage.setItem(localKey, 'captured-local');
      sessionStorage.setItem(sessionKey, 'captured-session');
      document.cookie = `${cookieName}=captured-cookie; Path=/; SameSite=Lax`;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(databaseName, 1);
        open.onupgradeneeded = () => open.result.createObjectStore('values');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('values', 'readwrite');
        transaction.objectStore('values').put('captured-indexeddb', 'state');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
    { localKey, sessionKey, cookieName, databaseName },
  );
  await context.unroute(seedPageUrl);
  await demo.goto(`${DEMO_ORIGIN}/`);
  await demo.getByRole('button', { name: 'Add a user' }).click();

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
  const archived = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
  ).json()) as StoredSession;
  const browserSnapshotEvent = archived.events.find(
    (event) =>
      event.kind === 'storage' &&
      event.name === 'browser-storage-initial' &&
      typeof event.payload?.['snapshotJson'] === 'string',
  );
  expect(browserSnapshotEvent).toBeDefined();
  const browserSnapshot = JSON.parse(
    String(browserSnapshotEvent?.payload?.['snapshotJson']),
  ) as {
    localStorage: readonly (readonly [string, string])[];
    sessionStorage: readonly (readonly [string, string])[];
    cookies: readonly Readonly<{ name: string; value: string }>[];
    indexedDb: readonly Readonly<{
      name: string;
      captured: boolean;
      stores: readonly Readonly<{
        name: string;
        records: readonly unknown[];
      }>[];
    }>[];
  };
  expect(browserSnapshot.localStorage).toContainEqual([
    localKey,
    'captured-local',
  ]);
  expect(browserSnapshot.sessionStorage).toContainEqual([
    sessionKey,
    'captured-session',
  ]);
  expect(browserSnapshot.cookies).toContainEqual(
    expect.objectContaining({ name: cookieName, value: 'captured-cookie' }),
  );
  expect(browserSnapshot.indexedDb).toContainEqual(
    expect.objectContaining({
      name: databaseName,
      captured: true,
      stores: expect.arrayContaining([
        expect.objectContaining({
          name: 'values',
          records: expect.arrayContaining([expect.any(Object)]),
        }),
      ]),
    }),
  );

  await demo.evaluate(
    async ({ localKey, sessionKey, cookieName, databaseName }) => {
      localStorage.setItem(localKey, 'mutated-local');
      sessionStorage.setItem(sessionKey, 'mutated-session');
      document.cookie = `${cookieName}=mutated-cookie; Path=/; SameSite=Lax`;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(databaseName);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('values', 'readwrite');
        transaction.objectStore('values').put('mutated-indexeddb', 'state');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
    { localKey, sessionKey, cookieName, databaseName },
  );

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await dashboard
    .getByRole('button', { name: 'Lecture à vitesse réelle' })
    .click();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    /\d+ \/ \d+ étapes · terminé/,
  );
  const replayApp = dashboard.frameLocator('#replay-target');
  await expect(replayApp.getByTestId('add-user')).toBeVisible();
  const bootState = await replayApp.locator('body').evaluate(async () => {
    const browserWindow = window as Window & {
      __replayBrowserStorageBoot?: Promise<Readonly<Record<string, unknown>>>;
    };
    return browserWindow.__replayBrowserStorageBoot;
  });
  expect(bootState).toMatchObject({
    local: 'captured-local',
    session: 'captured-session',
    cookie: 'captured-cookie',
    indexedDb: 'captured-indexeddb',
  });
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

  // The initial storage checkpoint is captured asynchronously during app
  // startup. Let it settle before asserting that an inactive tab stays idle.
  await expect
    .poll(async () => {
      const archived = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
      ).json()) as StoredSession;
      return archived.events.some(
        (event) =>
          event.kind === 'storage' && event.name === 'browser-storage-initial',
      );
    })
    .toBe(true);

  let stored: StoredSession | undefined;
  await expect
    .poll(async () => {
      stored = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
      ).json()) as StoredSession;
      return new Set(
        stored.events
          .filter(isRecordedApplicationInteraction)
          .map((event) => event.participantId),
      ).size;
    })
    .toBe(2);
  await expect
    .poll(async () => {
      const archived = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
      ).json()) as StoredSession;
      return archived.events.filter(
        (event) =>
          event.kind === 'storage' &&
          event.name === 'browser-storage-checkpoint',
      ).length;
    })
    .toBeGreaterThanOrEqual(2);
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
  const blurredParticipant = afterBlur.participants?.find(
    (participant) => participant.state === 'blurred',
  );
  expect(blurredParticipant).toBeDefined();
  const interactionsAfterBlur = afterBlur.events.filter(
    (event) =>
      event.participantId === blurredParticipant?.id &&
      isRecordedApplicationInteraction(event),
  ).length;
  await secondTab.waitForTimeout(1_200);
  const afterIdle = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
  ).json()) as StoredSession;
  expect(
    afterIdle.events.filter(
      (event) =>
        event.participantId === blurredParticipant?.id &&
        isRecordedApplicationInteraction(event),
    ),
  ).toHaveLength(interactionsAfterBlur);
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
      return response.events.filter(isRecordedApplicationInteraction).length;
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
          version: 6,
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
  ).toContainText('ACTIF');
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
  ).toContainText('ACTIF');
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
          version: 6,
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
          version: 6,
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
        isRecordedApplicationInteraction,
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
      return session.events.filter(isRecordedApplicationInteraction).length;
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
    .toBe(10);
  const interactions = session!.events.filter(
    (event) => event.kind === 'dom' && event.phase === 'emitted',
  );
  const clickInteractions = interactions.filter(
    (event) => event.payload?.['action'] === 'click',
  );
  expect(session!.version).toBe(6);
  expect(interactions).toHaveLength(10);
  expect(clickInteractions).toHaveLength(5);
  expect(
    clickInteractions.every((event) => {
      const target = event.payload?.['replayTarget'];
      return (
        typeof target === 'object' &&
        target !== null &&
        typeof (target as Record<string, unknown>)['runtimeId'] === 'string' &&
        Array.isArray((target as Record<string, unknown>)['componentPath']) &&
        Array.isArray((target as Record<string, unknown>)['localTargetPath'])
      );
    }),
  ).toBe(true);
  expect(
    JSON.stringify(
      clickInteractions.map((event) => event.payload?.['replayTarget']),
    ),
  ).not.toContain('data-user-id');
  const addUserCalls = session!.events.filter(
    (event) =>
      event.kind === 'craft' &&
      event.phase === 'started' &&
      event.payload?.['host'] === 'method:addUser' &&
      typeof event.payload?.['replayInvocation'] === 'object',
  );
  expect(addUserCalls).toHaveLength(6);
  expect(
    addUserCalls.filter((event) => {
      const invocation = event.payload?.['replayInvocation'];
      return (
        typeof invocation === 'object' &&
        invocation !== null &&
        Array.isArray((invocation as Record<string, unknown>)['args']) &&
        (
          ((invocation as Record<string, unknown>)['args'] as unknown[])[0] as
            | Record<string, unknown>
            | undefined
        )?.['$craftReplayEvent'] !== undefined
      );
    }),
  ).toHaveLength(2);
  const removalSelector = String(clickInteractions[2]?.payload?.['selector']);
  expect(removalSelector).toContain('[data-user-id=');
  expect(removalSelector).toContain('3');
  const navLinkSelector = String(clickInteractions[4]?.payload?.['selector']);
  expect(navLinkSelector).toContain('[data-testid="nav-panel"]');
  expect(navLinkSelector).toContain('nth-of-type');
  expect(clickInteractions[4]?.payload?.['href']).toBe(`${DEMO_ORIGIN}/i18n`);
  await demo.close();

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(dashboard.locator('[data-lab="left"]')).toContainText(
    /Format v6 · \d+ événements/,
  );
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  const diagnosticMode = dashboard.getByRole('button', {
    name: 'Mode diagnostic du replay',
  });
  await diagnosticMode.click();
  await expect(diagnosticMode).toHaveAttribute('aria-pressed', 'true');
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
  const frameBounds = await replayFrame.boundingBox();
  const visibleViewportBounds = await viewportFrame.boundingBox();
  expect(frameBounds).not.toBeNull();
  expect(visibleViewportBounds).not.toBeNull();
  expect(
    visibleViewportBounds!.width / visibleViewportBounds!.height,
  ).toBeCloseTo(session.viewport!.width / session.viewport!.height);
  expect(frameBounds!.width).toBeCloseTo(visibleViewportBounds!.width, 0);
  expect(frameBounds!.height).toBeCloseTo(visibleViewportBounds!.height, 0);
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
  await replayApp.getByTestId('add-user').evaluate((button) => {
    const replayWindow = window as Window & { replayClickCount?: number };
    replayWindow.replayClickCount = 0;
    button.addEventListener('click', () => {
      replayWindow.replayClickCount = (replayWindow.replayClickCount ?? 0) + 1;
    });
  });
  const replaySteps = session!.events
    .filter(
      (event) =>
        event.phase === 'emitted' &&
        ['dom', 'hover', 'scroll', 'viewport'].includes(event.kind),
    )
    .sort((left, right) => left.sequence - right.sequence);
  let replayStep = 0;
  const stepThrough = async (event: StoredSession['events'][number]) => {
    const targetIndex = replaySteps.findIndex(
      (step) => step.sequence === event.sequence,
    );
    expect(targetIndex).toBeGreaterThanOrEqual(replayStep);
    while (replayStep <= targetIndex) {
      await dashboard.getByRole('button', { name: 'Action suivante' }).click();
      replayStep += 1;
      await expect(
        dashboard.locator('[data-lab="replay-progress"]'),
      ).toContainText(`${replayStep} / ${replaySteps.length}`);
    }
  };

  await stepThrough(clickInteractions[0]!);
  const clickMarker = dashboard.locator('#replay-click-marker');
  await expect(clickMarker).toBeVisible();
  const firstClick = clickInteractions[0]?.payload;
  if (
    typeof firstClick?.['clientX'] === 'number' &&
    typeof firstClick['clientY'] === 'number'
  ) {
    const markerPosition = await clickMarker.evaluate((marker) => ({
      left: Number.parseFloat(getComputedStyle(marker).left),
      top: Number.parseFloat(getComputedStyle(marker).top),
    }));
    const scale = visibleViewportBounds!.width / session.viewport!.width;
    expect(markerPosition.left).toBeCloseTo(firstClick['clientX'] * scale, 0);
    expect(markerPosition.top).toBeCloseTo(firstClick['clientY'] * scale, 0);
  }
  await expect(replayApp.locator('[data-user-id="3"]')).toBeVisible();
  await expect
    .poll(() =>
      replayApp
        .locator('body')
        .evaluate(
          () =>
            (window as Window & { replayClickCount?: number }).replayClickCount,
        ),
    )
    .toBe(0);

  await stepThrough(clickInteractions[1]!);
  await expect(replayApp.locator('[data-user-id="4"]')).toBeVisible();

  await stepThrough(clickInteractions[2]!);
  await expect(replayApp.locator('[data-user-id="3"]')).toHaveCount(0);
  await expect(replayApp.locator('[data-user-id="4"]')).toBeVisible();

  await stepThrough(clickInteractions[3]!);
  await expect(replayApp.getByTestId('nav-panel')).toBeVisible();
  await stepThrough(clickInteractions[4]!);
  await expect
    .poll(async () =>
      dashboard
        .frames()
        .find((frame) => frame.url().startsWith(`${DEMO_ORIGIN}`))
        ?.url(),
    )
    .toBe(`${DEMO_ORIGIN}/i18n`);
  while (replayStep < replaySteps.length) {
    await dashboard.getByRole('button', { name: 'Action suivante' }).click();
    replayStep += 1;
  }
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    `${replaySteps.length} / ${replaySteps.length} étapes · terminé`,
  );

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
    `${replaySteps.length} / ${replaySteps.length} étapes · terminé`,
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

test('replays the recorded link destination through the app router', async ({
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
      return stored.events.filter(isRecordedApplicationInteraction).length;
    })
    .toBe(3);
  await expect
    .poll(async () => {
      const response = await request.get(
        `${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`,
      );
      if (!response.ok()) return false;
      const stored = (await response.json()) as StoredSession;
      return stored.events.some(
        (event) =>
          event.kind === 'primitive' &&
          event.name === 'primitive-change' &&
          event.payload?.['primitiveKind'] === 'query' &&
          JSON.stringify(event.state).includes('Katherine Johnson'),
      );
    })
    .toBe(true);
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
  expect(recordedLink!.payload!['href']).toBe(`${DEMO_ORIGIN}/pending-node`);
  await demo.close();

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/`);
  await dashboard.getByRole('button', { name: 'Importer un fichier' }).click();
  await dashboard
    .getByRole('textbox', { name: 'Session JSON' })
    .fill(JSON.stringify(session));
  await dashboard.getByRole('button', { name: 'Valider la session' }).click();
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(dashboard.getByRole('dialog')).toBeHidden();
  await expect(
    dashboard.getByRole('button', { name: 'Préparer le replay' }),
  ).toHaveCount(0);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  const replayApp = dashboard.frameLocator('#replay-target');
  await dashboard
    .getByRole('button', { name: 'Lecture à vitesse réelle' })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect
    .poll(async () =>
      dashboard
        .frames()
        .find((frame) => frame.url().startsWith(`${DEMO_ORIGIN}`))
        ?.url(),
    )
    .toBe(`${DEMO_ORIGIN}/pending-node`);
  await expect(
    replayApp.getByRole('heading', { name: 'settledValue + pendingNode' }),
  ).toBeVisible();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    /\d+ \/ \d+ étapes · terminé/,
  );
  await expect(
    dashboard.getByRole('region', { name: 'Notes du replay' }),
  ).toHaveCount(0);
  await expect(dashboard.locator('[data-lab="diff"]')).toBeHidden();

  await context.close();
});

test('replays hover cues and registered form insertion methods', async ({
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
  await demo.goto(`${DEMO_ORIGIN}/full-demo`);
  await expect(
    demo.getByRole('heading', { name: /Full primitives demo/ }),
  ).toBeVisible();
  await demo.getByPlaceholder('New todo').hover();
  await demo.getByPlaceholder('New todo').fill('Replay todo');
  await demo.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(demo.getByText('Replay todo')).toBeVisible();

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
      if (!response.ok()) return false;
      session = (await response.json()) as StoredSession;
      return session.events.some((event) => event.kind === 'hover');
    })
    .toBe(true);
  expect(
    session!.events.some(
      (event) =>
        event.kind === 'craft' &&
        event.phase === 'started' &&
        typeof event.payload?.['replayInvocation'] === 'object' &&
        String(
          (event.payload['replayInvocation'] as Record<string, unknown>)[
            'address'
          ],
        ).endsWith('form / method:submit'),
    ),
  ).toBe(true);
  expect(
    session!.events.some(
      (event) =>
        event.kind === 'craft' &&
        event.phase === 'succeeded' &&
        typeof event.payload?.['replayInvocation'] === 'object' &&
        String(
          (event.payload['replayInvocation'] as Record<string, unknown>)[
            'address'
          ],
        ).endsWith('form / method:submit'),
    ),
  ).toBe(true);
  await demo.close();

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  const replayApp = dashboard.frameLocator('#replay-target');
  await dashboard.getByRole('button', { name: 'Action suivante' }).click();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    '1 /',
  );
  await expect(dashboard.locator('#replay-click-marker')).toBeVisible();
  await expect(dashboard.locator('#replay-click-marker')).toHaveAttribute(
    'aria-label',
    /Survol rejoué/,
  );

  await dashboard
    .getByRole('button', { name: 'Lecture à vitesse réelle' })
    .click();
  await expect(replayApp.getByText('Replay todo')).toBeVisible({
    timeout: 30_000,
  });
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    'terminé',
  );

  await context.close();
});

test('replays a route-level queryParams method through invocation replay', async ({
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
    .getByRole('link', { name: 'Query Params', exact: true })
    .click();
  await expect(demo).toHaveURL(`${DEMO_ORIGIN}/query-params`);
  await expect(demo.getByTestId('current-page')).toHaveText('1');
  await demo.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(demo.getByTestId('current-page')).toHaveText('2');

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
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  const replayApp = dashboard.frameLocator('#replay-target');
  await dashboard
    .getByRole('button', { name: 'Lecture à vitesse réelle' })
    .click();
  await expect(replayApp.getByTestId('current-page')).toHaveText('2', {
    timeout: 30_000,
  });
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    'terminé',
  );
  await context.close();
});

test('replays slow Craft guards and resolvers without blocking navigation time', async ({
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
    .getByRole('link', { name: 'Slow Page', exact: true })
    .click();
  await expect(demo).toHaveURL(`${DEMO_ORIGIN}/slow-page`);
  await expect(demo.getByText('✅ Slow page loaded')).toBeVisible({
    timeout: 15_000,
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

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  const replayApp = dashboard.frameLocator('#replay-target');
  const replayStartedAt = Date.now();
  await dashboard
    .getByRole('button', { name: 'Lecture à vitesse réelle' })
    .click();
  await expect(replayApp.getByText('✅ Slow page loaded')).toBeVisible({
    timeout: 30_000,
  });
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    'terminé',
  );
  // The app loader runs through the replay's virtual clock, so the guard and
  // resolver settle at the same recorded point without a live network request.
  expect(Date.now() - replayStartedAt).toBeGreaterThanOrEqual(2_500);

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

  const recordedSession = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
  ).json()) as StoredSession;
  expect(
    recordedSession.events.some(
      (event) =>
        event.kind === 'pending' &&
        event.phase === 'started' &&
        event.payload?.['fallbackRendered'] === true,
    ),
  ).toBe(true);

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
  await expect(replayApp.getByText('3 people')).toBeVisible();
  expect(Date.now() - replayStartedAt).toBeGreaterThanOrEqual(800);
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    /\d+ \/ \d+ étapes · terminé/,
  );
  await expect(dashboard.locator('[data-lab="diff"]')).toBeHidden();

  await context.close();
});

test('replays the recorded Craft HTTP result without calling the live service', async ({
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
  let recordedRequests = 0;
  await demo.route('**/users', async (route) => {
    recordedRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'replay-user', name: 'Replay HTTP user' }]),
    });
  });
  await demo.goto(`${DEMO_ORIGIN}/`);
  await demo.getByTestId('nav-toggle').click();
  await demo
    .getByTestId('nav-panel')
    .getByRole('link', { name: 'Craft Lazy Layout', exact: true })
    .click();
  await expect(demo).toHaveURL(`${DEMO_ORIGIN}/craft/lazy-layout/100/users/42`);
  await expect(demo.getByText('Query status: resolved')).toBeVisible({
    timeout: 15_000,
  });
  expect(recordedRequests).toBe(1);

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
      if (!response.ok()) return false;
      session = (await response.json()) as StoredSession;
      return session.events.some(
        (event) =>
          event.kind === 'http' &&
          event.phase === 'succeeded' &&
          event.response !== undefined,
      );
    })
    .toBe(true);
  expect(
    session!.events.some(
      (event) =>
        event.kind === 'http' &&
        event.phase === 'started' &&
        event.payload?.['source'] === 'craft-http-client',
    ),
  ).toBe(true);
  expect(
    session!.events.some(
      (event) =>
        event.kind === 'primitive' &&
        event.name === 'primitive-change' &&
        event.payload?.['primitiveKind'] === 'query' &&
        JSON.stringify(event.state).includes('Replay HTTP user'),
    ),
  ).toBe(true);

  await demo.close();
  let replayLiveRequests = 0;
  await context.route('**/users', async (route) => {
    replayLiveRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  const replayApp = dashboard.frameLocator('#replay-target');
  await dashboard
    .getByRole('button', { name: 'Lecture à vitesse réelle' })
    .click();
  await expect(replayApp.getByText('Query status: resolved')).toBeVisible({
    timeout: 30_000,
  });
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    /\d+ \/ \d+ étapes · terminé/,
  );
  expect(replayLiveRequests).toBe(0);
  await context.close();
});

test('hides the seek overlay after resumed playback passes its target following forced recovery', async ({
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
        recording?.events.filter(isRecordedApplicationInteraction).length ?? 0
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
  const userInteractions = events.filter(isRecordedApplicationInteraction);
  const instrumentedEvents: typeof events = [];
  for (const event of events) {
    if (event === userInteractions[2]) {
      instrumentedEvents.push({
        id: 'seek-recovery-checkpoint',
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
        id: 'seek-forced-divergence',
        sequence: 0,
        timestamp: event.timestamp,
        kind: 'primitive',
        phase: 'emitted',
        state: divergentState,
      });
    }
  }
  instrumentedEvents.forEach((event, index) => {
    event.sequence = index + 1;
  });
  recording!.events = instrumentedEvents;
  await demo.close();

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/`);
  await dashboard.getByRole('button', { name: 'Importer un fichier' }).click();
  await dashboard
    .getByRole('textbox', { name: 'Session JSON' })
    .fill(JSON.stringify(recording));
  await dashboard.getByRole('button', { name: 'Valider la session' }).click();
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );

  const scrubber = dashboard.locator('[data-lab="replay-scrubber"]');
  const bounds = await scrubber.boundingBox();
  expect(bounds).not.toBeNull();
  await scrubber.click({
    position: { x: bounds!.width - 2, y: bounds!.height / 2 },
  });
  const seekOverlay = dashboard.locator('[data-lab="seek-overlay"]');
  await expect(seekOverlay).toBeVisible();
  await expect(dashboard.locator('[data-lab="diff"]')).toBeVisible();
  await expect(seekOverlay).toBeVisible();

  await dashboard.getByRole('button', { name: 'Forcer l’état attendu' }).click();
  await expect(dashboard.locator('[data-lab="diff"]')).toBeHidden();
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Reprise forcée',
  );
  await expect(seekOverlay).toBeVisible();

  await dashboard.getByRole('button', { name: 'Reprendre le replay' }).click();
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    /\d+ \/ \d+ étapes · terminé/,
  );
  await expect(seekOverlay).toBeHidden();
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
        recording?.events.filter(isRecordedApplicationInteraction).length ?? 0
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
  const userInteractions = events.filter(isRecordedApplicationInteraction);
  const instrumentedEvents: typeof events = [];
  let domCount = 0;
  let divergenceAfterRecovery: (typeof events)[number] | undefined;
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
      divergenceAfterRecovery = {
        id: 'divergence-after-recovery',
        sequence: 0,
        timestamp: event.timestamp,
        kind: 'primitive',
        phase: 'emitted',
        state: divergentState,
      };
    }
    if (isRecordedApplicationInteraction(event)) domCount += 1;
  }
  if (divergenceAfterRecovery) instrumentedEvents.push(divergenceAfterRecovery);
  expect(domCount).toBe(3);
  instrumentedEvents.forEach((event, index) => {
    event.sequence = index + 1;
  });
  recording!.events = instrumentedEvents;
  await demo.close();

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/`);
  await dashboard.getByRole('button', { name: 'Importer un fichier' }).click();
  await dashboard
    .getByRole('textbox', { name: 'Session JSON' })
    .fill(JSON.stringify(recording));
  await dashboard.getByRole('button', { name: 'Valider la session' }).click();
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(dashboard.getByRole('dialog')).toBeHidden();
  await expect(
    dashboard.getByRole('button', { name: 'Préparer le replay' }),
  ).toHaveCount(0);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );
  const replayProgress = dashboard.locator('[data-lab="replay-progress"]');
  const nextAction = dashboard.getByRole('button', { name: 'Action suivante' });
  const diff = dashboard.locator('[data-lab="diff"]');
  const replaySteps = recording!.events.filter(
    (event) =>
      event.phase === 'emitted' &&
      ['dom', 'hover', 'scroll', 'viewport'].includes(event.kind),
  ).length;
  for (let step = 0; step < replaySteps && !(await diff.isVisible()); step++) {
    const previousProgress = await replayProgress.innerText();
    await nextAction.evaluate((button) =>
      (button as HTMLButtonElement).click(),
    );
    await expect
      .poll(
        async () =>
          (await diff.isVisible()) ||
          (await replayProgress.innerText()) !== previousProgress,
      )
      .toBe(true);
  }
  await expect(diff).toBeVisible();

  const skip = dashboard.getByRole('button', {
    name: 'Aller à la suite',
  });
  await expect(skip).toBeVisible();
  await skip.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    /Replay partiel · intervalle \d+–\d+ ignoré/,
  );
  await expect(dashboard.locator('[data-lab="partial"]')).toContainText(
    'checkpoint resume-checkpoint',
  );
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    /\d+ \/ \d+/,
  );

  const replayApp = dashboard.frameLocator('#replay-target');
  await nextAction.evaluate((button) => (button as HTMLButtonElement).click());
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

test('opens the app live in its own tab from the replay position and from a journal event', async ({
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
  // Storage written after the start must come back in the debug tab.
  await demo.evaluate(() => localStorage.setItem('debug-e2e-marker', 'late'));
  await demo.getByTestId('nav-toggle').click();

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
      if (!response.ok()) return false;
      const stored = (await response.json()) as StoredSession;
      return stored.events.some(
        (event) =>
          event.kind === 'primitive' &&
          event.name === 'primitive-change' &&
          JSON.stringify(event.state).includes('Katherine Johnson'),
      );
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const response = await request.get(
        `${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`,
      );
      if (!response.ok()) return false;
      const stored = (await response.json()) as StoredSession;
      return stored.events.some(
        (event) =>
          event.kind === 'storage' &&
          event.name === 'browser-storage-checkpoint' &&
          JSON.stringify(event.payload).includes('debug-e2e-marker'),
      );
    })
    .toBe(true);
  const session = await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
  ).json();
  // Gone from the origin: only the recorded checkpoint can bring it back.
  await demo.evaluate(() => localStorage.removeItem('debug-e2e-marker'));
  await demo.close();

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/`);
  await dashboard.getByRole('button', { name: 'Importer un fichier' }).click();
  await dashboard
    .getByRole('textbox', { name: 'Session JSON' })
    .fill(JSON.stringify(session));
  await dashboard.getByRole('button', { name: 'Valider la session' }).click();
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Replay · ready',
  );

  // From the replay: once every action has run, the end of the recording.
  await dashboard
    .getByRole('button', { name: 'Lecture à vitesse réelle' })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(dashboard.locator('[data-lab="replay-progress"]')).toContainText(
    /\d+ \/ \d+ étapes · terminé/,
  );
  const [fromReplay] = await Promise.all([
    context.waitForEvent('page'),
    dashboard
      .locator('[data-lab="debug-app"]')
      .evaluate((button) => (button as HTMLButtonElement).click()),
  ]);
  await expect(fromReplay).toHaveURL(
    (url) =>
      url.origin === DEMO_ORIGIN &&
      url.pathname === '/pending-node' &&
      !url.search.includes('craft-debug-snapshot'),
  );
  await expect(
    fromReplay.getByRole('heading', { name: 'settledValue + pendingNode' }),
  ).toBeVisible();
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Application lancée en mode debug',
  );
  await expect
    .poll(() =>
      fromReplay.evaluate(() => localStorage.getItem('debug-e2e-marker')),
    )
    .toBe('late');
  await fromReplay.close();

  // From the journal: the state just before an event of the list.
  const toggle = dashboard.getByRole('button', {
    name: 'Journal',
    exact: true,
  });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true')
    await toggle.evaluate((button) => (button as HTMLButtonElement).click());
  await dashboard
    .getByRole('switch', { name: 'Tout afficher' })
    .evaluate((control) => (control as HTMLElement).click());
  const [fromJournal] = await Promise.all([
    context.waitForEvent('page'),
    dashboard
      .locator('[data-lab="debug-from-event"]')
      .first()
      .evaluate((button) => (button as HTMLButtonElement).click()),
  ]);
  await expect(fromJournal).toHaveURL(
    (url) =>
      url.origin === DEMO_ORIGIN &&
      !url.search.includes('craft-debug-snapshot'),
  );
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText(
    'Application lancée en mode debug',
  );

  await context.close();
});

test('relaunches the call whose request was still in flight at the chosen event', async ({
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
  const removeButtons = demo.getByRole('button', { name: /^Remove User/ });
  await expect(demo.getByRole('button', { name: 'Add a user' })).toBeVisible();
  const initialUsers = await removeButtons.count();
  await demo.getByRole('button', { name: 'Add a user' }).click();
  await expect(removeButtons).toHaveCount(initialUsers + 1);

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
  let session: (StoredSession & Record<string, unknown>) | undefined;
  await expect
    .poll(async () => {
      const response = await request.get(
        `${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`,
      );
      if (!response.ok()) return false;
      session = (await response.json()) as StoredSession &
        Record<string, unknown>;
      return session.events.some(
        (event) =>
          event.kind === 'craft' &&
          event.payload?.['host'] === 'method:addUser' &&
          typeof event.payload?.['replayInvocation'] === 'object',
      );
    })
    .toBe(true);
  await demo.close();

  // The recorded call, then a request it issued that never got its answer.
  const events = [...session!.events];
  const call = events.find(
    (event) =>
      event.kind === 'craft' && event.payload?.['host'] === 'method:addUser',
  )!;
  const last = Math.max(...events.map((event) => event.sequence));
  const correlationId = (call as Record<string, unknown>)['correlationId'];
  const synthetic = (sequence: number, extra: Record<string, unknown>) => ({
    id: `e2e-${sequence}`,
    sequence,
    timestamp: Date.now(),
    elapsedMs: 0,
    ...extra,
  });
  const imported = {
    ...session,
    events: [
      ...events,
      synthetic(last + 1, {
        kind: 'http',
        phase: 'started',
        operationId: 'e2e-http',
        correlationId,
        payload: { method: 'POST', url: `${DEMO_ORIGIN}/users` },
      }),
      synthetic(last + 2, {
        kind: 'custom',
        phase: 'emitted',
        name: 'e2e-end',
      }),
    ],
  };

  const dashboard = await context.newPage();
  await dashboard.goto(`${DASHBOARD_ORIGIN}/`);
  await dashboard.getByRole('button', { name: 'Importer un fichier' }).click();
  await dashboard
    .getByRole('textbox', { name: 'Session JSON' })
    .fill(JSON.stringify(imported));
  await dashboard.getByRole('button', { name: 'Valider la session' }).click();
  await expect(dashboard.locator('[data-lab="detail-page"]')).toBeVisible();
  const toggle = dashboard.getByRole('button', {
    name: 'Journal',
    exact: true,
  });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true')
    await toggle.evaluate((button) => (button as HTMLButtonElement).click());
  await dashboard
    .getByRole('switch', { name: 'Tout afficher' })
    .evaluate((control) => (control as HTMLElement).click());
  const [debugTab] = await Promise.all([
    context.waitForEvent('page'),
    dashboard
      .locator('[data-lab="debug-from-event"]')
      .last()
      .evaluate((button) => (button as HTMLButtonElement).click()),
  ]);
  // The user of the recording is restored, and the unanswered call ran again.
  await expect(
    debugTab.getByRole('button', { name: /^Remove User/ }),
  ).toHaveCount(initialUsers + 2, { timeout: 20_000 });
  await context.close();
});
