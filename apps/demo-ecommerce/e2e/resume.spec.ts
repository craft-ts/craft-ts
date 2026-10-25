import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

const DEMO_ORIGIN = process.env['CRAFT_E2E_DEMO_ORIGIN'] ?? 'http://localhost:4602';
const DASHBOARD_ORIGIN =
  process.env['CRAFT_E2E_DASHBOARD_ORIGIN'] ?? 'http://localhost:4604';
const SESSION_SERVER_ORIGIN =
  process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] ?? 'http://127.0.0.1:4603';

type SessionSummary = Readonly<{ id: string; status?: string }>;
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
type Identity = Readonly<{ id: string; role: string }>;

// ─── Enregistrement ─────────────────────────────────────────────────────────

async function sessionIds(request: APIRequestContext): Promise<Set<string>> {
  const result = (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
  ).json()) as { sessions: readonly SessionSummary[] };
  return new Set(result.sessions.map((session) => session.id));
}

async function newSessionId(
  request: APIRequestContext,
  previousIds: ReadonlySet<string>,
): Promise<string> {
  let sessionId = '';
  await expect
    .poll(async () => {
      sessionId =
        [...(await sessionIds(request))].find((id) => !previousIds.has(id)) ?? '';
      return sessionId;
    })
    .not.toBe('');
  return sessionId;
}

async function completedArchive(
  request: APIRequestContext,
  sessionId: string,
): Promise<SessionArchive> {
  await expect
    .poll(async () => {
      const result = (await (
        await request.get(`${SESSION_SERVER_ORIGIN}/sessions`)
      ).json()) as { sessions: readonly SessionSummary[] };
      return result.sessions.find((session) => session.id === sessionId)?.status;
    })
    .toBe('completed');
  return (await (
    await request.get(`${SESSION_SERVER_ORIGIN}/sessions/${sessionId}`)
  ).json()) as SessionArchive;
}

/** Connecte un compte hors de l'archive et renvoie l'entrée de storage à réinjecter. */
async function storedSessionOf(
  browser: Browser,
  account: string,
): Promise<[string, string]> {
  const bootstrap = await browser.newContext();
  const page = await bootstrap.newPage();
  await page.goto(`${DEMO_ORIGIN}/connexion`);
  await page.getByRole('button', { name: `Se connecter en tant que ${account}` }).click();
  await expect(page.getByText(`Bonjour ${account} !`)).toBeVisible();
  const stored = await page.evaluate(() =>
    Object.entries(localStorage).find(([key]) => key.includes('session.v1')),
  );
  expect(stored).toBeDefined();
  await bootstrap.close();
  return stored as [string, string];
}

async function recordingWithStoredSession(
  browser: Browser,
  stored: [string, string],
): Promise<BrowserContext> {
  const recording = await browser.newContext();
  await recording.addInitScript((entry: [string, string]) => {
    localStorage.setItem(entry[0], entry[1]);
  }, stored);
  return recording;
}

// ─── Reprise ────────────────────────────────────────────────────────────────

/** Un ancien jeton encore valide masquerait une reconnexion ratée. */
async function revokeAllSessions(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${DEMO_ORIGIN}/__dev/auth/revoke-all`);
  expect(response.ok()).toBe(true);
}

/** Observe les onglets repris : identité vue par le serveur, jetons de substitution, appels. */
function watchResumedTabs(dashboard: Page) {
  const pages: Page[] = [];
  const identities: Identity[] = [];
  const meFailures: string[] = [];
  const placeholderRequests: string[] = [];
  const calls: string[] = [];
  dashboard.context().on('page', (page) => {
    if (page === dashboard) return;
    pages.push(page);
    if (process.env['RESUME_E2E_DEBUG']) page.on('console', (message) => console.log('[resumed]', message.text()));
    page.on('request', (request) => {
      if (!request.url().startsWith(DEMO_ORIGIN)) return;
      const headers = request.headers();
      const functionId = headers['x-craft-function-id'];
      if (functionId) calls.push(functionId);
      const carried = [
        request.url(),
        request.postData() ?? '',
        ...Object.values(headers),
      ];
      if (carried.some((value) => value.includes('craft-ref:')))
        placeholderRequests.push(
          `${request.method()} ${request.url()} ${functionId ?? ''}`,
        );
    });
    page.on('response', async (response) => {
      if (response.request().headers()['x-craft-function-id'] !== 'ecommerce.auth.me')
        return;
      if (response.status() >= 400)
        meFailures.push(`${response.status()} ${response.request().postData() ?? ''}`);
      const session = decodeJson(await response.text().catch(() => ''));
      const user =
        session && typeof session === 'object' && 'user' in session
          ? (session.user as Record<string, unknown>)
          : undefined;
      if (typeof user?.['id'] === 'string' && typeof user['role'] === 'string')
        identities.push({ id: user['id'], role: user['role'] });
    });
  });
  return { pages, identities, meFailures, placeholderRequests, calls };
}

async function openJournal(dashboard: Page, sessionId: string): Promise<void> {
  await dashboard.goto(`${DASHBOARD_ORIGIN}/#/sessions/${sessionId}`);
}

async function planResumeBefore(dashboard: Page, eventName: string): Promise<void> {
  const journal = dashboard.getByRole('button', { name: 'Journal', exact: true });
  if ((await journal.getAttribute('aria-expanded')) !== 'true') await journal.click();
  await dashboard.getByRole('tab', { name: 'Journal' }).click();
  const showAll = dashboard.getByLabel('Tout afficher');
  if (!(await showAll.isChecked())) await showAll.check({ force: true });
  const event = dashboard.locator('[data-lab="events"] li').filter({ hasText: eventName });
  await expect(event).toHaveCount(1);
  await event.getByRole('button', { name: 'Reprendre ici' }).click();
  await dashboard.locator('details[data-lab="resume-plan"] > summary').click();
  await dashboard.locator('[data-lab="run-resume-preflight"]').click();
  await expect(dashboard.locator('[data-lab="resume-preflight-result"]')).toContainText(
    'Pré-vol réussi',
  );
  await expect(dashboard.locator('[data-lab="launch-resume"]')).toBeEnabled();
}

async function expectFidelity(dashboard: Page, classification: string): Promise<void> {
  const report = dashboard.locator('[data-lab="resume-execution-report"]');
  await expect(report).toHaveAttribute('data-fidelity', /.+/);
  // Le rapport complet dans le message : un échec dit quelle étape a cédé.
  expect(await report.getAttribute('data-fidelity'), (await report.textContent()) ?? '').toBe(
    classification,
  );
}

async function expectServerIdentity(
  resumed: ReturnType<typeof watchResumedTabs>,
  identity: Identity,
): Promise<void> {
  await expect.poll(() => resumed.identities.at(-1)).toEqual(identity);
  expect(resumed.meFailures).toEqual([]);
}

function decodeJson(value: string | null): unknown {
  if (value === null || value === '') return undefined;
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
    const call = decodeJson(
      typeof event.payload?.['body'] === 'string' ? String(event.payload['body']) : null,
    );
    return call && typeof call === 'object' && 'id' in call && typeof call.id === 'string'
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
  if ('id' in value && typeof value.id === 'string' && 'lines' in value && Array.isArray(value.lines))
    return value.id;
  for (const child of Object.values(value)) {
    const id = cartIdFromPayload(child);
    if (id) return id;
  }
  return undefined;
}

// ─── Scénarios ──────────────────────────────────────────────────────────────

/** PM login is valid; server authorization must still refuse a catalogue write. */
test('S1 resumes Inès and reproduces the recorded product-save 403', async ({
  browser,
  page: dashboard,
  request,
}) => {
  const previousIds = await sessionIds(request);
  const recording = await browser.newContext();
  const demo = await recording.newPage();
  await demo.goto(`${DEMO_ORIGIN}/admin`);
  await demo.getByRole('button', { name: 'Se connecter en tant que Inès' }).click();
  await expect(demo.getByText('Session de Inès')).toBeVisible();
  await demo.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  await demo.getByLabel('Nom').fill('Flat white reprise');
  await demo.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(demo.getByText('Action réservée aux administrateurs.')).toBeVisible();
  const sessionId = await newSessionId(request, previousIds);
  await recording.close();
  const archive = await completedArchive(request, sessionId);
  expect(
    archive.events.some(
      (event) => event.kind === 'http' && event.phase === 'succeeded' && event.response?.status === 403,
    ),
  ).toBe(true);

  if (process.env['RESUME_E2E_DEBUG']) dashboard.on('console', (message) => console.log('[dashboard]', message.text()));
  await openJournal(dashboard, sessionId);
  await revokeAllSessions(request);
  await planResumeBefore(dashboard, 'EcommerceAdminDashboard:form:product-form:submit');
  const tabs = watchResumedTabs(dashboard);
  const resumedPagePromise = dashboard.waitForEvent('popup');
  await dashboard.locator('[data-lab="launch-resume"]').click();
  const resumed = await resumedPagePromise;
  await expect(resumed.getByText('Session de Inès')).toBeVisible();
  await expect(resumed.getByLabel('Nom')).toHaveValue('Flat white reprise');
  await expectFidelity(dashboard, 'real');
  await expectServerIdentity(tabs, { id: 'ines', role: 'product-manager' });

  const forbidden = resumed.waitForResponse(
    (response) => response.url().includes('/__server-functions') && response.status() === 403,
  );
  await resumed.getByRole('button', { name: 'Enregistrer' }).click();
  await forbidden;
  await expect(resumed.getByText('Action réservée aux administrateurs.')).toBeVisible();
  // Le refus arrive après la prise en main : il est comparé à l'enregistrement.
  await expect(dashboard.locator('[data-lab="resume-execution-report"]')).toContainText(
    '403 attendu, 403 obtenu',
  );
  await expectFidelity(dashboard, 'real');
  expect(tabs.placeholderRequests).toEqual([]);
});

test('S2 reacquires a server cart with a new id without placing the archived order', async ({
  browser,
  page: dashboard,
  request,
}) => {
  const previousIds = await sessionIds(request);
  const recording = await browser.newContext();
  const demo = await recording.newPage();
  let originalCartId: string | undefined;
  let syncedLines = 0;
  if (process.env['RESUME_E2E_DEBUG'])
    demo.on('console', (message) => console.log('[recording]', message.text()));
  demo.on('response', async (response) => {
    if (!response.url().includes('/__server-functions')) return;
    const payload = await response.json().catch(() => undefined);
    originalCartId ??= cartIdFromPayload(payload);
    const cart = decodeJson(typeof payload === 'string' ? payload : JSON.stringify(payload));
    if (cart && typeof cart === 'object' && 'lines' in cart && Array.isArray(cart.lines))
      syncedLines = Math.max(syncedLines, cart.lines.length);
  });
  await demo.goto(`${DEMO_ORIGIN}/connexion`);
  await demo.getByRole('button', { name: 'Se connecter en tant que Léo' }).click();
  await expect(demo.getByText('Bonjour Léo !')).toBeVisible();
  await demo.goto(`${DEMO_ORIGIN}/catalogue`);
  await demo.getByRole('button', { name: '+ Ajouter' }).first().click();
  await expect.poll(() => originalCartId).not.toBeUndefined();
  await expect(demo.locator('body')).toContainText(/Panier\s*1/);
  // Quitter la page avant la fin de la synchronisation laisserait le panier
  // serveur hors de l'état enregistré.
  await expect.poll(() => syncedLines).toBe(1);
  await demo.waitForTimeout(300);
  await demo.goto(`${DEMO_ORIGIN}/panier`);
  await expect(demo.locator('body')).toContainText('Espresso');
  await expect(demo.locator('body')).toContainText('1 article(s)');
  await demo.getByRole('link', { name: /Passer commande/ }).click();
  await expect(demo.getByRole('button', { name: 'Confirmer la commande' })).toBeEnabled();
  const sessionId = await newSessionId(request, previousIds);
  await demo.getByRole('button', { name: 'Confirmer la commande' }).click();
  await expect(demo.getByText('Merci pour votre commande')).toBeVisible();
  await recording.close();
  const archive = await completedArchive(request, sessionId);
  const recordedCalls = callsOfArchive(archive);
  expect(recordedCalls).toContain('ecommerce.cart.create');
  expect(recordedCalls).toContain('ecommerce.checkout');

  await openJournal(dashboard, sessionId);
  await revokeAllSessions(request);
  await planResumeBefore(dashboard, 'EcommerceCheckoutPage:button:confirm-order:click');
  const tabs = watchResumedTabs(dashboard);
  let resumedCartId: string | undefined;
  dashboard.context().on('page', (page) => {
    if (page === dashboard) return;
    page.on('response', async (response) => {
      if (!response.url().includes('/__server-functions')) return;
      resumedCartId ??= cartIdFromPayload(await response.json().catch(() => undefined));
    });
  });
  const popupPromise = dashboard.waitForEvent('popup');
  await dashboard.locator('[data-lab="launch-resume"]').click();
  const resumed = await popupPromise;
  await expect(resumed.locator('body')).toContainText('1 × Espresso');
  if (process.env['RESUME_E2E_DEBUG']) {
    await expectFidelity(dashboard, 'real').catch(() => undefined);
    console.log('[report]', await dashboard.locator('[data-lab="resume-execution-report"]').textContent());
    console.log('[calls]', JSON.stringify(tabs.calls));
  }
  await expect.poll(() => resumedCartId).not.toBeUndefined();
  expect(resumedCartId).not.toBe(originalCartId);
  await expect(resumed.getByText('Merci pour votre commande')).toHaveCount(0);
  await expectFidelity(dashboard, 'real');
  await expectServerIdentity(tabs, { id: 'leo', role: 'client' });
  expect(tabs.calls).not.toContain('ecommerce.checkout');
  expect(tabs.placeholderRequests).toEqual([]);
});

test('S3 resumes a pending catalog debounce and admin poll with their remaining delays', async ({
  browser,
  page: dashboard,
  request,
}) => {
  // Bootstrap the demo persona outside the archive so the recorded gesture
  // stream never contains a redacted password argument.
  const stored = await storedSessionOf(browser, 'Camille');
  const previousIds = await sessionIds(request);
  const recording = await recordingWithStoredSession(browser, stored);
  const admin = await recording.newPage();
  let adminOverviewResponses = 0;
  admin.on('response', (response) => {
    if (response.url().includes('/__server-functions')) adminOverviewResponses += 1;
  });
  await admin.goto(`${DEMO_ORIGIN}/admin`);
  await expect(admin.getByText('Session de Camille')).toBeVisible();
  await expect(admin.getByText('Produits en ligne')).toBeVisible();
  await expect.poll(() => adminOverviewResponses).toBeGreaterThan(0);
  const sessionId = await newSessionId(request, previousIds);

  // Leave roughly 300 ms on the five-second admin poll. Capture the catalog
  // checkpoint after its 120 ms snapshot debounce, before the 300 ms search.
  await admin.waitForTimeout(4_100);
  const previousAdminResponses = adminOverviewResponses;
  const catalogue = await recording.newPage();
  await catalogue.goto(`${DEMO_ORIGIN}/catalogue`);
  await expect(catalogue.getByText('Flat white', { exact: true }).first()).toBeVisible();
  const search = catalogue.getByRole('searchbox', { name: 'Rechercher un produit' });
  await search.click();
  await search.pressSequentially(' Flat white', { delay: 0 });
  await expect(search).toHaveValue(/^\s*Flat white$/);
  await catalogue.waitForTimeout(160);
  await catalogue.getByRole('button', { name: 'Tout', exact: true }).click();
  await expect.poll(() => adminOverviewResponses).toBeGreaterThan(previousAdminResponses);
  await expect(catalogue.getByText('Flat white', { exact: true }).first()).toBeVisible();
  await recording.close();
  const archive = await completedArchive(request, sessionId);
  expect(new Set(archive.events.map((event) => event.participantId).filter(Boolean)).size).toBe(2);
  const taskOwners = new Set(
    archive.events
      .filter((event) => event.kind === 'snapshot' && event.name === 'replay-checkpoint')
      .flatMap((event) => {
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

  await openJournal(dashboard, sessionId);
  await dashboard.getByLabel('Onglets à visionner').selectOption('all');
  await expect(dashboard.locator('iframe[data-replay-participant]')).toHaveCount(2);
  await expect(dashboard.locator('[data-lab="status"]').first()).toContainText('Replay · ready');
  await revokeAllSessions(request);
  await planResumeBefore(dashboard, 'EcommerceCataloguePage:button:filter-all:click');
  const plan = dashboard.locator('[data-lab="resume-plan"]');
  await expect(plan).toContainText('catalog-search');
  await expect(plan).toContainText('admin-overview-poll');

  const tabs = watchResumedTabs(dashboard);
  const countCalls = (id: string) => tabs.calls.filter((call) => call === id).length;
  await dashboard.locator('[data-lab="launch-resume"]').click();
  await expect.poll(() => tabs.pages.length).toBe(2);
  const resumedCatalogue = tabs.pages.find((page) => page.url().includes('/catalogue'));
  const resumedAdmin = tabs.pages.find((page) => page.url().includes('/admin'));
  expect(resumedCatalogue).toBeDefined();
  expect(resumedAdmin).toBeDefined();
  await expect(
    resumedCatalogue!.getByRole('searchbox', { name: 'Rechercher un produit' }),
  ).toHaveValue(/^\s*Flat white$/);
  await expect(resumedAdmin!.getByText('Session de Camille')).toBeVisible();
  await expectFidelity(dashboard, 'real');
  await expectServerIdentity(tabs, { id: 'camille', role: 'admin' });
  await expect(resumedCatalogue!.getByText('Flat white', { exact: true }).first()).toBeVisible();
  await expect.poll(() => countCalls('ecommerce.catalog.search')).toBe(1);
  // The resumed admin page must issue a live overview request while its
  // pending poll has been rearmed from the archived delay.
  await expect.poll(() => countCalls('ecommerce.admin.overview')).toBeGreaterThan(0);
  await resumedCatalogue!.waitForTimeout(400);
  expect(countCalls('ecommerce.catalog.search')).toBe(1);
  expect(countCalls('ecommerce.admin.overview')).toBe(1);
  expect(tabs.placeholderRequests).toEqual([]);
});

test('S4 reconnects Léo when his identity only exists in the restored state', async ({
  browser,
  page: dashboard,
  request,
}) => {
  const stored = await storedSessionOf(browser, 'Léo');
  const previousIds = await sessionIds(request);
  const recording = await recordingWithStoredSession(browser, stored);
  const demo = await recording.newPage();
  await demo.goto(`${DEMO_ORIGIN}/connexion`);
  await expect(demo.getByText('Bonjour Léo !')).toBeVisible();
  await demo.goto(`${DEMO_ORIGIN}/catalogue`);
  await expect(demo.getByText('Flat white', { exact: true }).first()).toBeVisible();
  // Laisse passer le checkpoint (debounce de 120 ms) du catalogue.
  await demo.waitForTimeout(300);
  await demo.getByRole('button', { name: 'Tout', exact: true }).click();
  const sessionId = await newSessionId(request, previousIds);
  await recording.close();
  const archive = await completedArchive(request, sessionId);
  expect(callsOfArchive(archive)).not.toContain('ecommerce.auth.login');

  await openJournal(dashboard, sessionId);
  await revokeAllSessions(request);
  await planResumeBefore(dashboard, 'EcommerceCataloguePage:button:filter-all:click');
  const tabs = watchResumedTabs(dashboard);
  const popupPromise = dashboard.waitForEvent('popup');
  await dashboard.locator('[data-lab="launch-resume"]').click();
  const resumed = await popupPromise;
  await expect(resumed.getByText('Flat white', { exact: true }).first()).toBeVisible();
  await expectFidelity(dashboard, 'real');
  await expectServerIdentity(tabs, { id: 'leo', role: 'client' });
  expect(tabs.placeholderRequests).toEqual([]);
});

test('S5 skips the session acquisition when Léo signed out before the target', async ({
  browser,
  page: dashboard,
  request,
}) => {
  const previousIds = await sessionIds(request);
  const recording = await browser.newContext();
  const demo = await recording.newPage();
  await demo.goto(`${DEMO_ORIGIN}/connexion`);
  await demo.getByRole('button', { name: 'Se connecter en tant que Léo' }).click();
  await expect(demo.getByText('Bonjour Léo !')).toBeVisible();
  await demo.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(demo.getByRole('button', { name: 'Se connecter en tant que Léo' })).toBeVisible();
  await demo.waitForTimeout(300);
  await demo.goto(`${DEMO_ORIGIN}/catalogue`);
  await expect(demo.getByText('Flat white', { exact: true }).first()).toBeVisible();
  await demo.waitForTimeout(300);
  await demo.getByRole('button', { name: 'Tout', exact: true }).click();
  const sessionId = await newSessionId(request, previousIds);
  await recording.close();
  const archive = await completedArchive(request, sessionId);
  expect(callsOfArchive(archive)).toContain('ecommerce.auth.logout');

  await openJournal(dashboard, sessionId);
  await revokeAllSessions(request);
  await planResumeBefore(dashboard, 'EcommerceCataloguePage:button:filter-all:click');
  await expect(
    dashboard
      .locator('[data-entry="resume-step"]')
      .filter({ hasText: /acquire · .*signInProcess/ }),
  ).toContainText(/non nécessaire/i);
  const tabs = watchResumedTabs(dashboard);
  const popupPromise = dashboard.waitForEvent('popup');
  await dashboard.locator('[data-lab="launch-resume"]').click();
  const resumed = await popupPromise;
  await expect(resumed.getByText('Flat white', { exact: true }).first()).toBeVisible();
  await expectFidelity(dashboard, 'real');
  expect(tabs.calls).not.toContain('ecommerce.auth.login');
  expect(tabs.identities).toEqual([]);
  expect(tabs.placeholderRequests).toEqual([]);
});

/** Appelle une fonction serveur de la démo comme le ferait l'app. */
async function callDemoFunction(
  request: APIRequestContext,
  id: string,
  input: unknown,
): Promise<unknown> {
  const response = await request.post(`${DEMO_ORIGIN}/__server-functions`, {
    headers: { 'content-type': 'application/json', 'x-craft-protocol': '1', 'x-craft-function-id': id },
    data: { id, input },
  });
  expect(response.ok(), `${id} : HTTP ${response.status()}`).toBe(true);
  return decodeJson(await response.text());
}

test('S6 refuses a resume whose cart product was deleted after the recording', async ({
  browser,
  page: dashboard,
  request,
}) => {
  const previousIds = await sessionIds(request);
  const recording = await browser.newContext();
  const demo = await recording.newPage();
  await demo.goto(`${DEMO_ORIGIN}/connexion`);
  await demo.getByRole('button', { name: 'Se connecter en tant que Léo' }).click();
  await expect(demo.getByText('Bonjour Léo !')).toBeVisible();
  await demo.goto(`${DEMO_ORIGIN}/catalogue`);
  await demo.getByRole('button', { name: '+ Ajouter' }).first().click();
  await expect(demo.locator('body')).toContainText(/Panier\s*1/);
  await demo.goto(`${DEMO_ORIGIN}/panier`);
  await expect(demo.locator('body')).toContainText('Espresso');
  await demo.getByRole('link', { name: /Passer commande/ }).click();
  await expect(demo.getByRole('button', { name: 'Confirmer la commande' })).toBeEnabled();
  const sessionId = await newSessionId(request, previousIds);
  await demo.getByRole('button', { name: 'Confirmer la commande' }).click();
  await expect(demo.getByText('Merci pour votre commande')).toBeVisible();
  await recording.close();
  await completedArchive(request, sessionId);

  await openJournal(dashboard, sessionId);
  await revokeAllSessions(request);
  await planResumeBefore(dashboard, 'EcommerceCheckoutPage:button:confirm-order:click');
  // Le backend change entre le pré-vol du dashboard et la reprise.
  const admin = (await callDemoFunction(request, 'ecommerce.auth.login', {
    email: 'camille@atelier.demo',
    password: 'atelier-admin',
  })) as { token: string };
  await callDemoFunction(request, 'ecommerce.product.delete', {
    token: admin.token,
    id: 'espresso',
  });
  const tabs = watchResumedTabs(dashboard);
  await dashboard.locator('[data-lab="launch-resume"]').click();
  await expectFidelity(dashboard, 'refused');
  await expect(dashboard.locator('[data-lab="resume-execution-report"]')).toContainText(
    'espresso',
  );
  expect(tabs.calls).not.toContain('ecommerce.checkout');
  expect(tabs.placeholderRequests).toEqual([]);
});
