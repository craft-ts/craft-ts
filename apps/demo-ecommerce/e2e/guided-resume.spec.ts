import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Page } from '@playwright/test';
// The two MCP servers run in this process, from source: the test plays the AI
// through real MCP clients, without a model.
// This e2e hosts the two MCP servers in-process to exercise the real protocol.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { LogReader } from '../../../packages/log-mcp/src/log-reader';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createLogMcpServer } from '../../../packages/log-mcp/src/mcp-server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { RegistryBridgeBroker } from '../../../packages/function-registry-mcp/src/bridge-broker';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createRegistryMcpServer } from '../../../packages/function-registry-mcp/src/mcp-server';
import { craftSession, expect, test } from './fixtures';

const serverOrigin =
  process.env['CRAFT_E2E_SESSION_SERVER_ORIGIN'] ?? 'http://127.0.0.1:4322';
const bridgePort = Number(process.env['CRAFT_E2E_MCP_BRIDGE_PORT'] ?? '4334');
const dashboardOrigin =
  process.env['CRAFT_E2E_SESSION_DASHBOARD_ORIGIN'] ?? 'http://localhost:4212';
const resumeRequestId = '00000000-0000-4000-8000-000000000006';

type Json = Record<string, unknown>;

async function connect(server: McpServer): Promise<Client> {
  const client = new Client({ name: 'ia-simulee', version: '1.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

async function tool<T = Json>(
  client: Client,
  name: string,
  args: Json = {},
): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  const text = JSON.stringify(result.content);
  if (result.isError) throw new Error(`${name} failed: ${text}`);
  const payload = (result.structuredContent as { result?: T } | undefined)
    ?.result as (T & { error?: string }) | undefined;
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    payload.error
  )
    throw new Error(`${name} failed: ${payload.error}`);
  return payload as T;
}

async function sessionIds(): Promise<Set<string>> {
  const listing = (await (await fetch(`${serverOrigin}/sessions`)).json()) as {
    sessions: { id: string }[];
  };
  return new Set(listing.sessions.map((session) => session.id));
}

/** The address of the primitive that holds the session token, read from the target. */
function tokenHolder(primitives: Json): string {
  const address = Object.keys(primitives).find((key) => {
    const value = primitives[key];
    return (
      typeof value === 'object' &&
      value !== null &&
      'token' in value &&
      key.search(/signIn|session/i) >= 0
    );
  });
  if (!address)
    throw new Error(`No token holder in ${Object.keys(primitives).join(', ')}`);
  return address;
}

/** The recorded "who am I" call, as a probe that sends the live token. */
function whoAmIProbe(recorded: Json, holder: string, expectText: string): Json {
  const request = recorded['request'] as {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  const body =
    typeof request.body === 'string'
      ? (JSON.parse(request.body) as Json)
      : (request.body as Json);
  const withToken = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(withToken)
      : typeof value === 'object' && value !== null
        ? Object.fromEntries(
            Object.entries(value).map(([key, item]) =>
              key === 'token'
                ? [key, `{{state ${holder} token}}`]
                : [key, withToken(item)],
            ),
          )
        : value;
  const url = new URL(request.url, 'http://app.invalid');
  return {
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers: { 'content-type': 'application/json' },
    body: withToken(body),
    expect: { status: 200, match: [expectText] },
  };
}

async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.locator('body').waitFor();
}

test.describe('reprise guidée par une IA simulée', () => {
  let broker: RegistryBridgeBroker;
  let logs: Client;
  let registry: Client;
  let logDirectory: string;

  test.beforeAll(async () => {
    process.env['LOG_SERVER_URL'] = serverOrigin;
    logDirectory = mkdtempSync(join(tmpdir(), 'guided-resume-logs-'));
    broker = new RegistryBridgeBroker({
      port: bridgePort,
      requestTimeoutMs: 15_000,
    });
    await broker.ready();
    logs = await connect(
      createLogMcpServer(new LogReader({ directory: logDirectory })),
    );
    registry = await connect(
      createRegistryMcpServer(broker, { logServerUrl: serverOrigin }),
    );
  });

  test.afterAll(async () => {
    await logs?.close();
    await registry?.close();
    await broker?.close();
    rmSync(logDirectory, { recursive: true, force: true });
  });

  test(
    'l’IA lit la session, ramène l’app au point, rend la main et fige le point',
    {
      // The app records on its own; the test reads that recording, it keeps no history.
      annotation: craftSession({ id: 'resume.guided', capture: 'none' }),
    },
    async ({ page, craftSessions }) => {
      test.setTimeout(180_000);

      // 1. Camille, admin, se connecte et ouvre l'administration : la session s'enregistre.
      const known = await sessionIds();
      await page.goto('/admin');
      await page
        .getByRole('button', { name: /Se connecter en tant que Camille/ })
        .click();
      await page.getByRole('link', { name: 'Mon compte' }).waitFor();
      await expect(page.locator('.admin-row').first()).toBeVisible();
      let sessionId = '';
      await expect
        .poll(
          async () => {
            sessionId =
              [...(await sessionIds())].find((id) => !known.has(id)) ?? '';
            if (!sessionId) return [];
            const story = await tool<{ steps: { label: string }[] }>(
              logs,
              'session.story',
              { sessionId },
            );
            return story.steps.map((step) => step.label);
          },
          { timeout: 20_000 },
        )
        .toEqual(
          expect.arrayContaining([
            expect.stringContaining('ecommerce.auth.login'),
          ]),
        );
      // The point is fixed now: later tabs may share the recording.
      const recorded = (await (
        await fetch(`${serverOrigin}/sessions/${sessionId}`)
      ).json()) as { events: { sequence: number }[] };
      const beforeSequence =
        Math.max(...recorded.events.map((event) => event.sequence)) + 1;
      await page.close();

      // 2. « Reprendre ici » dans le dashboard publie le point.
      await fetch(`${serverOrigin}/sessions/resume-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: resumeRequestId,
          sessionId,
          beforeSequence,
        }),
      });

      // 3. L'IA lit la demande, les prérequis et la cible.
      const request = await tool<{ request: Json }>(logs, 'resume.request', {
        requestId: resumeRequestId,
      });
      expect(request.request).toMatchObject({
        id: resumeRequestId,
        sessionId,
        beforeSequence,
      });
      const prerequisites = await tool<{
        identities: Json[];
        session: Json & { signedInWhen?: Json };
      }>(logs, 'session.prerequisites', { requestId: resumeRequestId });
      expect(prerequisites.identities[0]).toMatchObject({ role: 'admin' });
      expect(prerequisites.session).toMatchObject({
        open: true,
        signedInWhen: { unmasked: true },
      });
      const target = await tool<{ route: string; primitives: Json }>(
        logs,
        'session.target',
        { requestId: resumeRequestId },
      );
      expect(target.route).toBe('/admin');
      const holder = tokenHolder(target.primitives);

      // 4. Dans un navigateur vierge, l'IA ramène l'app au point.
      const resumeContext = await craftSessions.newContext();
      const tab = await resumeContext.newPage();
      await openApp(tab);
      await tool(registry, 'page', { timeoutMs: 20_000 });
      const launched = await tool<{ reloading: boolean }>(
        registry,
        'app.launch',
        { sessionId, beforeSequence, requestId: resumeRequestId },
      );
      expect(launched.reloading).toBe(true);
      await expect(tab).toHaveURL(
        new RegExp(`/admin\\?craft-resume-request=${resumeRequestId}$`),
        { timeout: 20_000 },
      );
      const doctor = await tool<{ ready: boolean; clientId?: string }>(
        registry,
        'resume.doctor',
        { requestId: resumeRequestId },
      );
      expect(doctor.ready).toBe(true);
      expect(doctor.clientId).toBeDefined();
      const clientId = doctor.clientId!;
      const atPoint = await tool<{ route: Json }>(registry, 'app.diff', {
        sessionId,
        beforeSequence,
        clientId,
        requestId: resumeRequestId,
        timeoutMs: 30_000,
      });
      expect(atPoint.route).toMatchObject({ equal: true });

      // 5. L'archive masque le jeton : la session n'est pas ouverte. L'IA ne tape
      //    pas le mot de passe, elle rend la main et reprend dès qu'un vrai jeton est là.
      const controls = await tool<{ controls: { id: string }[] }>(
        registry,
        'page',
        { clientId, timeoutMs: 20_000 },
      );
      expect(controls.controls.map((control) => control.id)).toContain(
        'quick-sign-in',
      );
      const refused = await tool<{ error?: string }>(registry, 'page', {
        clientId,
        act: [{ id: 'sign-in-password', fill: 'secret' }],
      }).catch((error: Error) => ({ error: error.message }));
      expect(refused.error).toContain('sensitive');
      // 6. La recette prépare la connexion, attend l'intervention humaine, puis
      //    reprend seule le scénario et fige un point lié à cette recette.
      const whoAmI = await tool<Json>(logs, 'session.recordedCall', {
        call: 'ecommerce.auth.me',
      });
      const recipe = await tool<{ id: string }>(registry, 'recipe.save', {
        sessionId,
        beforeSequence,
        origin: new URL(await tab.url()).origin,
        objective: {
          goal: 'Vérifier le brouillon de prix d’un Espresso créé par la recette',
          exact: ['brouillon à 4,83 €'],
          approximate: ['identifiant et ordre de la liste'],
          mayWrite: true,
        },
        strategy: 'autonomous',
        steps: [
          { type: 'goto', route: '/connexion' },
          {
            type: 'handoff',
            message:
              'Connecte-toi avec un compte admin ; je reprends dès que la session est ouverte.',
            field: 'sign-in-password',
            until: prerequisites.session.signedInWhen,
            timeoutMs: 60_000,
            reuseMs: 60 * 60_000,
          },
          { type: 'goto', route: '/' },
          { type: 'goto', route: '/admin' },
          {
            type: 'ensure',
            timeoutMs: 1_000,
            condition: {
              address:
                'component:EcommerceAppShell / component:CraftRouterOutlet / service:craftRouterOutletState / route:admin / component:EcommerceAdminPage / component:EcommerceAdminDashboard / service:adminView / query:adminStore / query:adminStore',
              path: 'products',
              matches: 'reprise-fixed',
            },
            remedy: [
              {
                type: 'create',
                address: 'ecommerce.product.save',
                as: 'referenceProduct',
                input: {
                  token: `{{state ${holder} token}}`,
                  product: {
                    kind: 'simple',
                    id: 'reprise-fixed',
                    name: 'Reprise · Référence',
                    description: 'Produit recréé par le remède.',
                    categoryId: 'coffee',
                    price: 2.5,
                    stock: 1,
                  },
                },
              },
              { type: 'goto', route: '/' },
              { type: 'goto', route: '/admin' },
            ],
          },
          {
            type: 'create',
            address: 'ecommerce.product.save',
            input: {
              token: `{{state ${holder} token}}`,
              product: {
                kind: 'simple',
                id: 'reprise-{{run}}',
                name: 'Reprise {{run}} · Espresso',
                description: 'Produit créé par une recette de reprise.',
                categoryId: 'coffee',
                price: 3.5,
                stock: 32,
              },
            },
            as: 'product',
          },
          { type: 'goto', route: '/' },
          { type: 'goto', route: '/admin' },
          {
            type: 'act',
            action: {
              id: 'edit-product',
              match: { track: '{{created.product.id}}' },
            },
          },
          { type: 'act', action: { id: 'product-price', fill: '4.83' } },
          {
            type: 'expect',
            level: 'essential',
            condition: {
              address:
                'service:adminDesk / state:productDraft / state:productDraft',
              path: 'price',
              equals: '4.83',
            },
          },
          {
            type: 'checkpoint',
            ttlMs: 60 * 60_000,
            ttlReason: 'Session de démo e2e valable une heure.',
            probes: [whoAmIProbe(whoAmI, holder, 'admin')],
          },
        ],
        cleanup: [
          {
            address: 'ecommerce.product.delete',
            input: {
              token: `{{state ${holder} token}}`,
              id: '{{created.product.id}}',
            },
          },
          {
            address: 'ecommerce.product.delete',
            input: { token: `{{state ${holder} token}}`, id: 'reprise-fixed' },
          },
        ],
        revisions: [
          {
            at: new Date().toISOString(),
            by: 'ai',
            reason: 'Première recette générée pendant la reprise guidée.',
          },
        ],
      });
      let run = await tool<{
        runId: string;
        nextStep: number;
        status?: string;
      }>(registry, 'recipe.run', { clientId, id: recipe.id, supervised: true });
      expect(run).toMatchObject({ completedStep: 0, nextStep: 1 });
      const waitingForSignIn = tool<{
        runId: string;
        nextStep: number;
        status?: string;
      }>(registry, 'recipe.run', {
        clientId,
        id: recipe.id,
        runId: run.runId,
        supervised: true,
      });
      await expect(
        tab.locator('[data-craft-guided-resume-handoff]'),
      ).toContainText('compte admin');
      await tab
        .getByRole('button', { name: /Se connecter en tant que Camille/ })
        .click();
      run = await waitingForSignIn;
      expect(run).toMatchObject({ completedStep: 1, nextStep: 2 });
      await expect(
        tab.locator('[data-craft-guided-resume-handoff]'),
      ).toHaveCount(0);
      await expect(tab.getByRole('link', { name: 'Mon compte' })).toBeVisible();
      while (run.nextStep < 8)
        run = await tool(registry, 'recipe.run', {
          clientId,
          id: recipe.id,
          runId: run.runId,
          supervised: true,
        });
      const signedIn = await tool<{ route: Json }>(registry, 'app.diff', {
        sessionId,
        beforeSequence,
        clientId,
        requestId: resumeRequestId,
      });
      expect(signedIn.route).toMatchObject({ equal: true });
      const writes = await tool<{ writes: Json[] }>(registry, 'app.writes', {
        clientId,
      });
      expect(writes.writes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ method: 'POST', status: 'allowed' }),
        ]),
      );
      const pageState = await tool<{
        controls: { id: string; name: string; track?: string }[];
      }>(registry, 'page', { clientId });
      expect(pageState.controls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'edit-product',
            track: `reprise-${run.runId}`,
          }),
        ]),
      );
      let completed = run;
      while (completed.nextStep < 12)
        completed = await tool(registry, 'recipe.run', {
          clientId,
          id: recipe.id,
          runId: completed.runId,
          supervised: true,
        });
      completed = await tool(registry, 'recipe.run', {
        clientId,
        id: recipe.id,
        runId: completed.runId,
        supervised: true,
      });
      expect(completed).toMatchObject({ status: 'completed' });
      page.once('dialog', (dialog) => {
        void dialog.accept();
      });
      await tool(registry, 'page', {
        clientId,
        act: [{ id: 'delete-product', match: { track: 'reprise-fixed' } }],
      });
      const autonomous = await tool<{ runId: string; status: string }>(
        registry,
        'recipe.run',
        { clientId, id: recipe.id },
      );
      expect(autonomous).toMatchObject({ status: 'completed' });
      const stored = await tool<{
        recipe: { id: string };
        runs: { id: string; status: string; events: { kind: string }[] }[];
      }>(logs, 'recipe.get', { id: recipe.id });
      expect(stored.recipe).toMatchObject({ id: recipe.id });
      expect(stored.runs).toHaveLength(2);
      expect(stored.runs.every((item) => item.status === 'completed')).toBe(
        true,
      );
      expect(
        stored.runs.some((item) =>
          item.events.some((event) => event.kind === 'remedy-applied'),
        ),
      ).toBe(true);
      const recipePoints = await tool<{ id: string; recipeId?: string }[]>(
        registry,
        'checkpoint.list',
        { sessionId, beforeSequence },
      );
      expect(recipePoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ recipeId: recipe.id }),
        ]),
      );
      const linkedPoint = recipePoints.find(
        (point) => point.recipeId === recipe.id,
      );
      expect(linkedPoint).toBeDefined();
      const validity = await tool<{ valid: boolean }>(
        registry,
        'checkpoint.validate',
        { clientId, id: linkedPoint!.id },
      );
      expect(validity.valid).toBe(true);
      await resumeContext.close();

      // 7. Sans IA : le point se rouvre seul et ses sondes passent.
      const reopenContext = await craftSessions.newContext();
      const reopened = await reopenContext.newPage();
      await openApp(
        reopened,
        `/admin?craft-resume-checkpoint=${linkedPoint!.id}`,
      );
      await expect(
        reopened.getByRole('link', { name: 'Mon compte' }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(reopened).not.toHaveURL(/craft-resume-checkpoint/);
      await reopened.waitForTimeout(1_500);
      await expect(
        reopened.locator('[data-craft-resume-checkpoint-notice]'),
      ).toHaveCount(0);

      // 8. Une sonde rouge déclare le point invalide.
      await tool(registry, 'page', { timeoutMs: 20_000 });
      const broken = await tool<{ id: string }>(registry, 'checkpoint.save', {
        sessionId,
        beforeSequence,
        ttlMs: 60 * 60_000,
        ttlReason: 'point de test d’une sonde rouge',
        probes: [whoAmIProbe(whoAmI, holder, 'aucun-compte-ne-porte-ce-nom')],
      });
      await reopenContext.close();
      const brokenContext = await craftSessions.newContext();
      const brokenTab = await brokenContext.newPage();
      await openApp(brokenTab, `/admin?craft-resume-checkpoint=${broken.id}`);
      await expect(
        brokenTab.locator('[data-craft-resume-checkpoint-notice]'),
      ).toContainText('ne tient plus', { timeout: 20_000 });
      await brokenContext.close();

      // 9. Un point lié arrivé à expiration relance sa recette. La recette
      //    prépare la connexion, rend la main, puis finit sans IA.
      const expiredContext = await craftSessions.newContext();
      const expiredTab = await expiredContext.newPage();
      await expiredTab.clock.install({
        time: new Date(Date.now() + 2 * 60 * 60_000),
      });
      await openApp(
        expiredTab,
        `/admin?craft-resume-checkpoint=${linkedPoint!.id}`,
      );
      await expect(
        expiredTab.locator('[data-craft-guided-resume-handoff]'),
      ).toContainText('Connecte-toi avec un compte admin', { timeout: 20_000 });
      await expiredTab
        .getByRole('button', { name: /Se connecter en tant que Camille/ })
        .click();
      await expect(
        expiredTab.getByRole('link', { name: 'Mon compte' }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        expiredTab.locator('[data-craft-guided-resume-handoff]'),
      ).toHaveCount(0);
      await expect
        .poll(
          async () => {
            const history = await tool<{ runs: { status: string }[] }>(
              logs,
              'recipe.get',
              { id: recipe.id },
            );
            return history.runs.filter((item) => item.status === 'completed')
              .length;
          },
          { timeout: 20_000 },
        )
        .toBe(3);
      await expiredContext.close();

      // 10. Le dashboard montre le résultat et la recette ; les réponses restent dans la conversation de l’agent.
      await tool(logs, 'resume.say', {
        requestId: resumeRequestId,
        kind: 'done',
        text: 'Point figé, valide une heure.',
      });
      const dashboardContext = await craftSessions.newContext();
      const dashboard = await dashboardContext.newPage();
      await dashboard.goto(`${dashboardOrigin}/#/sessions/${sessionId}`);
      await dashboard
        .getByRole('button', { name: 'Journal', exact: true })
        .click();
      await dashboard.getByRole('tab', { name: 'Reprise' }).click();
      await expect(
        dashboard.locator('[data-lab="resume-thread"]'),
      ).toContainText('Point figé, valide une heure.', { timeout: 20_000 });
      await expect(
        dashboard.locator('[data-lab="resume-recipes"]'),
      ).toContainText(
        'Vérifier le brouillon de prix d’un Espresso créé par la recette',
        { timeout: 20_000 },
      );
      await dashboardContext.close();
    },
  );
});
