import { expect, test } from '@playwright/test';

const DASHBOARD_ORIGIN =
  process.env['CRAFT_E2E_DASHBOARD_ORIGIN'] ?? 'http://localhost:4604';
const SESSION_SERVER_ORIGIN =
  process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] ?? 'http://127.0.0.1:4603';

type SessionSummary = Readonly<{ id: string }>;
type SessionArchive = Readonly<{
  participants?: readonly Readonly<{ id: string }>[];
  events: readonly Readonly<{
    kind: string;
    phase: string;
    participantId?: string;
    name?: string;
    payload?: Readonly<Record<string, unknown>>;
    response?: Readonly<{ status?: number }>;
  }>[];
}>;

/** PM login is valid; server authorization must still refuse a catalogue write. */
test('S1 resumes Inès and reproduces the recorded product-save 403', async ({
  browser,
  page: dashboard,
  request,
}) => {
  const before = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
  ).json()) as { sessions: readonly SessionSummary[] };
  const previousIds = new Set(before.sessions.map((session) => session.id));

  const recording = await browser.newContext();
  const demo = await recording.newPage();
  await demo.goto(`${process.env['CRAFT_E2E_DEMO_ORIGIN'] ?? 'http://localhost:4602'}/admin`);
  await demo.getByRole('button', { name: 'Se connecter en tant que Inès' }).click();
  await expect(demo.getByText('Session de Inès')).toBeVisible();
  await demo.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await demo.getByLabel('Nom').fill('Flat white reprise');
  await demo.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(demo.getByText('Action réservée aux administrateurs.')).toBeVisible();

  let sessionId = '';
  await expect
    .poll(async () => {
      const result = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as { sessions: readonly SessionSummary[] };
      sessionId =
        result.sessions.find((session) => !previousIds.has(session.id))?.id ?? '';
      return sessionId;
    })
    .not.toBe('');
  await recording.close();
  await expect
    .poll(async () => {
      const result = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as {
        sessions: readonly (SessionSummary & { status: string })[];
      };
      return result.sessions.find((session) => session.id === sessionId)?.status;
    })
    .toBe('completed');

  const archive = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
  ).json()) as SessionArchive;
  expect(
    archive.events.some(
      (event) =>
        event.kind === 'http' &&
        event.phase === 'succeeded' &&
        event.response?.status === 403,
    ),
  ).toBe(true);

  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  const openJournal = dashboard.getByRole('button', {
    name: 'Journal',
    exact: true,
  });
  if ((await openJournal.getAttribute('aria-expanded')) !== 'true')
    await openJournal.click();
  await dashboard.getByRole('tab', { name: 'Journal' }).click();
  const showAll = dashboard.getByLabel('Tout afficher');
  if (!(await showAll.isChecked())) await showAll.check({ force: true });
  const submitEvent = dashboard
    .locator('[data-lab="events"] li')
    .filter({ hasText: 'EcommerceAdminDashboard:form:product-form:submit' });
  await expect(submitEvent).toHaveCount(1);
  await submitEvent.getByRole('button', { name: 'Reprendre ici' }).click();

  await dashboard.locator('details[data-lab="resume-plan"] > summary').click();
  await dashboard.locator('[data-lab="run-resume-preflight"]').click();
  await expect(dashboard.locator('[data-lab="resume-preflight-result"]')).toContainText(
    'Pré-vol réussi',
  );
  await expect(dashboard.locator('[data-lab="launch-resume"]')).toBeEnabled();

  const resumedPagePromise = dashboard.waitForEvent('popup');
  await dashboard.locator('[data-lab="launch-resume"]').click();
  const resumed = await resumedPagePromise;
  await expect(resumed.getByText('Session de Inès')).toBeVisible();
  await expect(resumed.getByLabel('Nom')).toHaveValue('Flat white reprise');
  await expect(
    dashboard.locator('[data-lab="resume-execution-report"]'),
  ).toContainText('Fidélité real');

  const forbidden = resumed.waitForResponse(
    (response) =>
      response.url().includes('/__server-functions') && response.status() === 403,
  );
  await resumed.getByRole('button', { name: 'Enregistrer' }).click();
  await forbidden;
  await expect(
    resumed.getByText('Action réservée aux administrateurs.'),
  ).toBeVisible();
  await recording.close().catch(() => undefined);
});

function decodeCall(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    let decoded: unknown = JSON.parse(value);
    for (let depth = 0; depth < 2 && typeof decoded === 'string'; depth += 1)
      decoded = JSON.parse(decoded);
    return decoded;
  } catch {
    return undefined;
  }
}

function callsOfArchive(archive: SessionArchive): readonly string[] {
  return archive.events.flatMap((event) => {
    if (event.kind !== 'http' || event.phase !== 'started') return [];
    const call = decodeCall(
      typeof event.payload?.['body'] === 'string'
        ? String(event.payload['body'])
        : null,
    );
    return call &&
      typeof call === 'object' &&
      'id' in call &&
      typeof call.id === 'string'
      ? [call.id]
      : [];
  });
}

function cartIdFromPayload(value: unknown): string | undefined {
  if (typeof value === 'string') {
    try {
      return cartIdFromPayload(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== 'object') return undefined;
  if (
    'id' in value &&
    typeof value.id === 'string' &&
    'lines' in value &&
    Array.isArray(value.lines)
  )
    return value.id;
  for (const child of Object.values(value)) {
    const id = cartIdFromPayload(child);
    if (id) return id;
  }
  return undefined;
}

test('S2 reacquires a server cart with a new id without placing the archived order', async ({
  browser,
  page: dashboard,
  request,
}) => {
  const before = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
  ).json()) as { sessions: readonly SessionSummary[] };
  const previousIds = new Set(before.sessions.map((session) => session.id));
  const demoOrigin = process.env['CRAFT_E2E_DEMO_ORIGIN'] ?? 'http://localhost:4602';
  const recording = await browser.newContext();
  const demo = await recording.newPage();
  let originalCartId: string | undefined;
  demo.on('response', async (response) => {
    if (!response.url().includes('/__server-functions')) return;
    originalCartId ??= cartIdFromPayload(
      await response.json().catch(() => undefined),
    );
  });
  await demo.goto(`${demoOrigin}/connexion`);
  await demo.getByRole('button', { name: 'Se connecter en tant que Léo' }).click();
  await expect(demo.getByText('Bonjour Léo !')).toBeVisible();
  await demo.goto(`${demoOrigin}/catalogue`);
  await demo.getByRole('button', { name: '+ Ajouter' }).first().click();
  await expect.poll(() => originalCartId).not.toBeUndefined();
  await expect(demo.locator('body')).toContainText(/Panier\s*1/);
  await demo.goto(`${demoOrigin}/panier`);
  await expect(demo.locator('body')).toContainText('Flat white');
  await expect(demo.locator('body')).toContainText('1 article(s)');
  await demo.getByRole('link', { name: /Passer commande/ }).click();
  await expect(demo.getByRole('button', { name: 'Confirmer la commande' })).toBeEnabled();

  let sessionId = '';
  await expect
    .poll(async () => {
      const result = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as { sessions: readonly SessionSummary[] };
      sessionId = result.sessions.find((session) => !previousIds.has(session.id))?.id ?? '';
      return sessionId;
    })
    .not.toBe('');
  await demo.getByRole('button', { name: 'Confirmer la commande' }).click();
  await expect(demo.getByText('Merci pour votre commande')).toBeVisible();
  await recording.close();
  await expect
    .poll(async () => {
      const result = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as { sessions: readonly (SessionSummary & { status: string })[] };
      return result.sessions.find((session) => session.id === sessionId)?.status;
    })
    .toBe('completed');

  const archive = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
  ).json()) as SessionArchive;
  const recordedCalls = callsOfArchive(archive);
  expect(recordedCalls).toContain('ecommerce.cart.create');
  expect(recordedCalls).toContain('ecommerce.checkout');

  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  const journal = dashboard.getByRole('button', { name: 'Journal', exact: true });
  if ((await journal.getAttribute('aria-expanded')) !== 'true') await journal.click();
  await dashboard.getByRole('tab', { name: 'Journal' }).click();
  const showAll = dashboard.getByLabel('Tout afficher');
  if (!(await showAll.isChecked())) await showAll.check({ force: true });
  const submitEvent = dashboard
    .locator('[data-lab="events"] li')
    .filter({ hasText: 'EcommerceCheckoutPage:button:confirm-order:click' });
  await expect(submitEvent).toHaveCount(1);
  await submitEvent.getByRole('button', { name: 'Reprendre ici' }).click();
  await dashboard.locator('details[data-lab="resume-plan"] > summary').click();
  await dashboard.locator('[data-lab="run-resume-preflight"]').click();
  await expect(dashboard.locator('[data-lab="resume-preflight-result"]')).toContainText('Pré-vol réussi');

  let resumedCartId: string | undefined;
  dashboard.context().on('page', (page) => {
    if (page === dashboard) return;
    page.on('response', async (response) => {
      if (!response.url().includes('/__server-functions')) return;
      resumedCartId ??= cartIdFromPayload(
        await response.json().catch(() => undefined),
      );
    });
  });
  const popupPromise = dashboard.waitForEvent('popup');
  await dashboard.locator('[data-lab="launch-resume"]').click();
  const resumed = await popupPromise;
  await expect(resumed.locator('body')).toContainText('Flat white');
  await expect(resumed.locator('body')).toContainText('1 × Flat white');
  await expect
    .poll(async () => {
      return resumedCartId;
    })
    .not.toBeUndefined();
  expect(resumedCartId).not.toBe(originalCartId);
  await expect(resumed.getByText('Merci pour votre commande')).toHaveCount(0);
  await expect(dashboard.locator('[data-lab="resume-execution-report"]')).toContainText('Fidélité real');
  await recording.close().catch(() => undefined);
});

test('S3 resumes a pending catalog debounce and admin poll with their remaining delays', async ({
  browser,
  page: dashboard,
  request,
}) => {
  const demoOrigin = process.env['CRAFT_E2E_DEMO_ORIGIN'] ?? 'http://localhost:4602';
  // Bootstrap the demo persona outside the archive so the recorded gesture
  // stream never contains a redacted password argument.
  const bootstrap = await browser.newContext();
  const bootstrapPage = await bootstrap.newPage();
  await bootstrapPage.goto(`${demoOrigin}/connexion`);
  await bootstrapPage.getByRole('button', { name: 'Se connecter en tant que Camille' }).click();
  await expect(bootstrapPage.getByText('Bonjour Camille !')).toBeVisible();
  const storedSession = await bootstrapPage.evaluate(() =>
    Object.entries(localStorage).find(([key]) => key.includes('session.v1')),
  );
  expect(storedSession).toBeDefined();
  await bootstrap.close();

  const before = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
  ).json()) as { sessions: readonly SessionSummary[] };
  const previousIds = new Set(before.sessions.map((session) => session.id));
  const recording = await browser.newContext();
  await recording.addInitScript((entry: [string, string]) => {
    localStorage.setItem(entry[0], entry[1]);
  }, storedSession as [string, string]);
  const admin = await recording.newPage();
  let adminOverviewResponses = 0;
  admin.on('response', (response) => {
    if (response.url().includes('/__server-functions'))
      adminOverviewResponses += 1;
  });
  await admin.goto(`${demoOrigin}/admin`);
  await expect(admin.getByText('Session de Camille')).toBeVisible();
  await expect(admin.getByText('Produits en ligne')).toBeVisible();
  await expect.poll(() => adminOverviewResponses).toBeGreaterThan(0);

  let sessionId = '';
  await expect
    .poll(async () => {
      const result = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as { sessions: readonly SessionSummary[] };
      sessionId = result.sessions.find((session) => !previousIds.has(session.id))?.id ?? '';
      return sessionId;
    })
    .not.toBe('');

  // Leave roughly 300 ms on the five-second admin poll. Capture the catalog
  // checkpoint after its 120 ms snapshot debounce, before the 300 ms search.
  await admin.waitForTimeout(4_100);
  const previousAdminResponses = adminOverviewResponses;
  const catalogue = await recording.newPage();
  await catalogue.goto(`${demoOrigin}/catalogue`);
  await expect(catalogue.getByText('Flat white', { exact: true }).first()).toBeVisible();
  const search = catalogue.getByRole('searchbox', { name: 'Rechercher un produit' });
  await search.click();
  await search.pressSequentially(' Flat white', { delay: 0 });
  await expect(search).toHaveValue(/^\s*Flat white$/);
  await catalogue.waitForTimeout(160);
  await catalogue.getByRole('button', { name: 'Tout', exact: true }).click();
  await expect
    .poll(() => adminOverviewResponses)
    .toBeGreaterThan(previousAdminResponses);
  await expect(catalogue.getByText('Flat white', { exact: true }).first()).toBeVisible();
  await recording.close();
  await expect
    .poll(async () => {
      const result = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as {
        sessions: readonly (SessionSummary & { status: string })[];
      };
      return result.sessions.find((session) => session.id === sessionId)?.status;
    })
    .toBe('completed');

  const archive = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
  ).json()) as SessionArchive;
  expect(new Set(archive.events.map((event) => event.participantId).filter(Boolean)).size).toBe(2);
  const checkpoints = archive.events.filter(
    (event) => event.kind === 'snapshot' && event.name === 'replay-checkpoint',
  );
  const taskOwners = new Set(
    checkpoints.flatMap((event) => {
      const tasks = event.payload?.['pendingTasks'];
      return Array.isArray(tasks)
        ? tasks.flatMap((task) =>
            task && typeof task === 'object' && 'owner' in task && typeof task.owner === 'string'
              ? [task.owner]
              : [],
          )
        : [];
    }),
  );
  expect(taskOwners).toContain('catalog-search');
  expect(taskOwners).toContain('admin-overview-poll');

  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
  await dashboard.getByLabel('Onglets à visionner').selectOption('all');
  await expect(dashboard.locator('iframe[data-replay-participant]')).toHaveCount(2);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText('Replay · ready');
  const journal = dashboard.getByRole('button', { name: 'Journal', exact: true });
  if ((await journal.getAttribute('aria-expanded')) !== 'true') await journal.click();
  await dashboard.getByRole('tab', { name: 'Journal' }).click();
  const showAll = dashboard.getByLabel('Tout afficher');
  if (!(await showAll.isChecked())) await showAll.check({ force: true });
  const resumeEvent = dashboard
    .locator('[data-lab="events"] li')
    .filter({ hasText: 'EcommerceCataloguePage:button:filter-all:click' });
  await expect(resumeEvent).toHaveCount(1);
  await resumeEvent.getByRole('button', { name: 'Reprendre ici' }).click();
  await dashboard.locator('details[data-lab="resume-plan"] > summary').click();
  const plan = dashboard.locator('[data-lab="resume-plan"]');
  await expect(plan).toContainText('catalog-search');
  await expect(plan).toContainText('admin-overview-poll');
  await dashboard.locator('[data-lab="run-resume-preflight"]').click();
  await expect(dashboard.locator('[data-lab="resume-preflight-result"]')).toContainText('Pré-vol réussi');

  const resumedPages: import('@playwright/test').Page[] = [];
  let resumedSearchRequests = 0;
  let resumedAdminRequests = 0;
  dashboard.context().on('page', (page) => {
    if (page === dashboard) return;
    resumedPages.push(page);
  });
  dashboard.context().on('request', (request) => {
    if (!request.url().includes('/__server-functions')) return;
    const functionId = request.headers()['x-craft-function-id'];
    if (functionId === 'ecommerce.catalog.search') resumedSearchRequests += 1;
    if (functionId === 'ecommerce.admin.overview') resumedAdminRequests += 1;
  });
  await dashboard.locator('[data-lab="launch-resume"]').click();
  await expect.poll(() => resumedPages.length).toBe(2);
  const resumedCatalogue = resumedPages.find((page) => page.url().includes('/catalogue'));
  const resumedAdmin = resumedPages.find((page) => page.url().includes('/admin'));
  expect(resumedCatalogue).toBeDefined();
  expect(resumedAdmin).toBeDefined();
  await expect(resumedCatalogue!.getByRole('searchbox', { name: 'Rechercher un produit' })).toHaveValue(/^\s*Flat white$/);
  await expect(resumedAdmin!.getByText('Session de Camille')).toBeVisible();
  await dashboard.locator('details[data-lab="resume-execution-report"] > summary').click();
  await expect(dashboard.locator('[data-lab="resume-execution-report"]')).toContainText('Fidélité real');
  await expect(resumedCatalogue!.getByText('Flat white', { exact: true }).first()).toBeVisible();
  await expect.poll(() => resumedSearchRequests).toBe(1);
  // The resumed admin page must issue a live overview request while its
  // pending poll has been rearmed from the archived delay.
  await expect.poll(() => resumedAdminRequests).toBeGreaterThan(0);
  await resumedCatalogue!.waitForTimeout(400);
  expect(resumedSearchRequests).toBe(1);
  expect(resumedAdminRequests).toBe(1);
  await recording.close().catch(() => undefined);
});
