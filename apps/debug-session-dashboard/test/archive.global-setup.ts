import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { TestProject } from 'vitest/node';
// The dashboard's tests run against the real archive: the log server is the
// boundary they prove the pages through, not code they may reach into.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createLogHttpServer } from '../../log-server/src/http-server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { DebugSessionStore } from '../../log-server/src/debug-session-store';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { LogStore } from '../../log-server/src/log-store';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { ResumeCheckpointStore } from '../../log-server/src/resume-checkpoints';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { parseResumeRecipeInput, ResumeRecipeStore } from '../../log-server/src/resume-recipes';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { ThumbnailService } from '../../log-server/src/thumbnails/thumbnail-service';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createSessionsCheckAccess } from '../../log-server/src/sessions-check';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { ThumbnailStore } from '../../log-server/src/thumbnails/thumbnail-store';

export const ARCHIVED_SESSION_ID = '0b9f2f8e-6c3d-4b1a-9e47-5a0c2d8e1f01';
/** The same recording again, started elsewhere, for the test that deletes one. */
export const DISPOSABLE_SESSION_ID = '0b9f2f8e-6c3d-4b1a-9e47-5a0c2d8e1f02';
/**
 * Past the retention a few seconds after the archive starts: what « Nettoyer
 * les anciennes » removes. The store drops what is already expired when it
 * opens or records, so an old session can only age while the archive runs.
 */
const AGING_SESSION_ID = '0b9f2f8e-6c3d-4b1a-9e47-5a0c2d8e1f03';
const AGES_IN_MS = 3_000;
/** Recorded for a replay this dashboard does not know: « Supprimer les incompatibles ». */
const INCOMPATIBLE_SESSION_ID = '0b9f2f8e-6c3d-4b1a-9e47-5a0c2d8e1f04';
const RETENTION_MS = 24 * 60 * 60 * 1000;
/** The same checkout recorded by hand (no test metadata): the suite keeps it. */
export const HAND_RECORDED_SESSION_ID = '0b9f2f8e-6c3d-4b1a-9e47-5a0c2d8e1f05';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
/** Vitest's default jsdom URL. */
const JSDOM_ORIGIN = 'http://localhost:3000';

/**
 * One archive for the dashboard's page tests, on a directory of its own: the
 * pilot's recorded checkout as two sessions, a recipe and a resume point on
 * the first, an app's coverage report and demo-ecommerce's e2e references.
 * The pages read it over HTTP, as the dashboard reads the developer's.
 */
export default async function setup(project: TestProject) {
  const directory = await mkdtemp(join(tmpdir(), 'craft-dashboard-archive-'));
  const session = JSON.parse(
    gunzipSync(
      readFileSync(join(workspaceRoot, 'packages/session-trace/src/__fixtures__/shop.checkout.session.json.gz')),
    ).toString('utf8'),
  );
  const sessionStore = new DebugSessionStore(join(directory, 'sessions'), {
    maxAgeMs: RETENTION_MS,
  });
  const now = new Date().toISOString();
  for (const [id, recorded, createdAt] of [
    [ARCHIVED_SESSION_ID, session, now],
    [DISPOSABLE_SESSION_ID, { ...session, startUrl: 'http://localhost:4205/panier' }, now],
    [
      AGING_SESSION_ID,
      { ...session, startUrl: 'http://localhost:4205/connexion' },
      new Date(Date.now() - RETENTION_MS + AGES_IN_MS).toISOString(),
    ],
    [
      INCOMPATIBLE_SESSION_ID,
      { ...session, startUrl: 'http://localhost:4205/admin', replayVersion: 99 },
      now,
    ],
    // At the shop's home: the list's tests look for the others by address.
    // Recorded with the app's exchanges (version 8): the suite leaves older
    // recordings out, they cannot be replayed past their first call.
    [HAND_RECORDED_SESSION_ID, { ...withoutTestMetadata(session), version: 8, startUrl: 'http://localhost:4205/' }, now],
  ] as const) {
    sessionStore.begin(id, recorded, createdAt);
    sessionStore.finish(id, 'completed');
  }

  const recipes = new ResumeRecipeStore(join(directory, 'sessions', 'recipes'));
  const recipe = parseResumeRecipeInput({
    sessionId: ARCHIVED_SESSION_ID,
    beforeSequence: 12,
    origin: 'http://localhost:4205',
    objective: { goal: 'Reprendre le panier avant la commande', exact: ['panier'], approximate: [], mayWrite: false },
    strategy: 'autonomous',
    steps: [{ type: 'checkpoint' }],
    cleanup: [],
    revisions: [{ at: '2026-11-03T08:00:00.000Z', by: 'ai', reason: 'Recette de test.' }],
  });
  if (typeof recipe === 'string') throw new Error(recipe);
  const savedRecipe = recipes.save(recipe);

  const checkpoints = new ResumeCheckpointStore(join(directory, 'sessions', 'checkpoints'));
  checkpoints.save({
    sessionId: ARCHIVED_SESSION_ID,
    beforeSequence: 20,
    origin: 'http://localhost:4205',
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    ttlReason: 'le panier serveur vit une heure',
    snapshot: { format: 'craft-debug-app-snapshot', version: 1, route: '/panier', primitives: {}, storage: [], warnings: [] },
    probes: [],
    created: [],
    deviations: [],
    goal: 'revoir le panier',
  } as never);

  // What an app's architecture suite leaves for the coverage page.
  const coveredApp = join(directory, 'apps', 'demo-shop');
  mkdirSync(join(coveredApp, '.craft'), { recursive: true });
  writeFileSync(
    join(coveredApp, '.craft', 'behavior-coverage.json'),
    JSON.stringify({
      version: 1,
      app: 'demo-shop',
      behaviors: [
        { id: 'mutation:cart.addLine#success', kind: 'mutation', file: 'src/cart.ts', status: 'proven', provenBy: ['src/cart.spec.ts > adds a line'] },
        { id: 'route:shop:checkout', kind: 'route', file: 'src/app.routes.ts', status: 'unproven', provenBy: [] },
      ],
    }),
  );

  // What `npm run sessions:check` leaves for the suite page: the shop's last
  // check, a change to approve and a regression.
  const checkRepository = join(directory, 'repository');
  const checkReport = join(checkRepository, 'tmp', 'sessions-check', 'demo-shop', 'report.json');
  const writeCheck = (approved: boolean) => {
    mkdirSync(join(checkReport, '..'), { recursive: true });
    writeFileSync(
      checkReport,
      JSON.stringify({
        format: 'craft-golden-check',
        schemaVersion: 1,
        app: 'demo-shop',
        origin: 'http://localhost:4205',
        base: 'main (abc1234)',
        head: 'arbre de travail',
        sessions: [
          { sessionId: ARCHIVED_SESSION_ID, verdict: 'regression', reason: 'la tête s’écarte de l’enregistrement à l’action 4' },
          {
            sessionId: HAND_RECORDED_SESSION_ID,
            verdict: 'changed',
            reason: '2 moment(s) sur 8 diffèrent',
            change: { moments: [3, 5], fingerprint: 'f1' },
            ...(approved ? { approved: true } : {}),
          },
          { sessionId: DISPOSABLE_SESSION_ID, verdict: 'unchanged', reason: 'aucune différence hors du bruit' },
        ],
        counts: { regression: 1, changed: 1, flaky: 0, stale: 0, unchanged: 1 },
        approved: approved ? 1 : 0,
        passed: false,
      }),
    );
  };
  writeCheck(false);

  const e2eSessions = join(workspaceRoot, 'apps/demo-ecommerce/e2e/__sessions__');
  const history = JSON.parse(
    readFileSync(join(e2eSessions, 'shop.checkout', 'chromium', 'history.json'), 'utf8'),
  ) as { runs: { file: string }[] };
  const [reference] = history.runs;
  if (!reference) throw new Error('shop.checkout has no e2e reference.');

  const server = createLogHttpServer({
    store: new LogStore({ directory: join(directory, 'logs') }),
    sessionStore,
    e2eSessionRoots: [e2eSessions],
    behaviorApps: [coveredApp],
    checkpoints,
    recipes,
    // jsdom's own origin, which its XMLHttpRequest sends as the dashboard would.
    allowedOrigins: [JSDOM_ORIGIN],
    // No browser to replay with: the replay a suite runs answers at its
    // boundary, as a healthy session replays.
    suiteReplay: async (sessionId) => ({
      sessionId,
      status: 'completed',
      replayIndex: 14,
      total: 14,
      unprovenInteractions: [],
      notes: [],
      durationMs: 1,
    }),
    // The check's own command, at its boundary: it approves a change and
    // refuses anything else, as `sessions-check.mjs --approve` does.
    sessionsCheck: createSessionsCheckAccess({
      repository: checkRepository,
      run: async ([, sessionId]) => {
        if (sessionId !== HAND_RECORDED_SESSION_ID)
          return { code: 1, stdout: '', stderr: 'une régression ne s’approuve pas' };
        writeCheck(true);
        return { code: 0, stdout: 'approuvé', stderr: '' };
      },
    }),
    // No browser to capture with: the archive says so, as with
    // DEBUG_SESSION_THUMBNAILS=0.
    thumbnails: new ThumbnailService({
      store: new ThumbnailStore(join(directory, 'sessions', 'thumbnails')),
      sessions: sessionStore,
      unavailableReason: 'Aperçus désactivés pour les tests.',
    }),
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Read by the dashboard's data-access services, as in a dev run.
  process.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] = url;
  project.provide('archiveUrl', url);
  project.provide('archivedSessionId', ARCHIVED_SESSION_ID);
  project.provide('disposableSessionId', DISPOSABLE_SESSION_ID);
  project.provide('handRecordedSessionId', HAND_RECORDED_SESSION_ID);
  project.provide('recipeId', savedRecipe.id);
  project.provide(
    'e2eReferenceSource',
    `/e2e-sessions/shop.checkout/chromium/${reference.file}?root=0&decompress=1`,
  );
  return async () => {
    await new Promise((done) => server.close(done));
    sessionStore.close();
    await rm(directory, { recursive: true, force: true });
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    archiveUrl: string;
    archivedSessionId: string;
    disposableSessionId: string;
    handRecordedSessionId: string;
    recipeId: string;
    e2eReferenceSource: string;
  }
}

function withoutTestMetadata<Session extends Record<string, unknown>>(recorded: Session): Omit<Session, 'test'> {
  const { test: _test, ...rest } = recorded;
  return rest;
}

