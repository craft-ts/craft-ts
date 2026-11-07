import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeDependencyGraph, type DependencyGraph } from '@craft-ts/dev-tools/dependency-graph';
import { normalizeSessionTrace, sessionCoverageUnits } from '@craft-ts/session-trace';
import { changesFromUnifiedDiff, relevantGoldenSessions, type GoldenSetForImpact } from './relevant-sessions.js';

const repository = fileURLToPath(new URL('../../..', import.meta.url));
const app = `${repository}apps/demo-ecommerce`;
const fixtures = `${repository}packages/session-trace/src/__fixtures__`;

describe('changesFromUnifiedDiff', () => {
  it('reads the changed lines of each file, new side', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -3 +3 @@ export const a = 1;',
      '@@ -10,0 +11,4 @@',
      '@@ -20,2 +24,0 @@',
      'diff --git a/src/gone.ts b/src/gone.ts',
      '--- a/src/gone.ts',
      '+++ /dev/null',
      '@@ -1,5 +0,0 @@',
    ].join('\n');
    expect(changesFromUnifiedDiff(diff)).toEqual([
      { file: 'src/a.ts', lines: [[3, 3], [11, 14], [24, 25]] },
      { file: 'src/gone.ts' },
    ]);
  });
});

describe('relevantGoldenSessions on the e-commerce demo', () => {
  let graph: DependencyGraph;
  let goldenSet: GoldenSetForImpact;
  const node = (kind: string, test: (details: Record<string, unknown>, label: string) => boolean) => {
    const found = graph.nodes.find((candidate) => candidate.kind === kind && test(candidate.details ?? {}, candidate.label));
    if (!found?.filePath || found.line === undefined) throw new Error(`${kind} introuvable`);
    return found as typeof found & { filePath: string; line: number };
  };
  const relevant = (changes: Parameters<typeof relevantGoldenSessions>[2]) =>
    relevantGoldenSessions(graph, goldenSet, changes, { rootDir: app });
  const hits = (result: ReturnType<typeof relevant>) => Object.fromEntries(result.sessions.map((session) => [session.sessionId, session.hit]));

  beforeAll(() => {
    graph = analyzeDependencyGraph({ rootDir: app, tsConfigFilePath: 'tsconfig.json' });
    // The sessions the demo's e2e recorded: a purchase, a product edit, an admin in two tabs.
    goldenSet = {
      sessions: ['shop.checkout', 'admin.edit-product', 'admin.multicontext'].map((sessionId) => ({
        sessionId,
        recordedAt: '2026-11-01T00:00:00.000Z',
        units: sessionCoverageUnits(normalizeSessionTrace(
          JSON.parse(gunzipSync(readFileSync(`${fixtures}/${sessionId}.session.json.gz`)).toString('utf8')) as { events: Record<string, unknown>[] },
        )),
      })),
    };
    // Analysing a whole app takes several seconds.
  }, 120_000);

  it('replays the purchase first when the confirmation button changes', () => {
    const button = node('template-element', (details) => details['localName'] === 'confirm-order');
    const result = relevant([{ file: button.filePath, lines: [[button.line, button.line]] }]);
    expect(hits(result)).toEqual({ 'shop.checkout': 'direct', 'admin.multicontext': 'impact' });
    expect(result.sessions[0]).toMatchObject({
      sessionId: 'shop.checkout',
      units: expect.arrayContaining(['interaction:EcommerceCheckoutPage:button:confirm-order:click']),
      because: expect.arrayContaining(['template-element:confirm-order']),
    });
    expect(result.untouched).toBe(1);
  });

  it('replays the admin sessions, not the purchase, when the admin dashboard changes', () => {
    const dashboard = node('component', (_details, label) => label === 'EcommerceAdminDashboard');
    const result = relevant([{ file: dashboard.filePath, lines: [[dashboard.line + 30, dashboard.line + 30]] }]);
    expect(hits(result)).toEqual({ 'admin.edit-product': 'direct', 'admin.multicontext': 'direct' });
  });

  it('replays the sessions that call a server function when it changes', () => {
    const checkout = node('server-function-family', (details) => details['serverFunctionId'] === 'ecommerce.checkout');
    const result = relevant([{ file: checkout.filePath, lines: [[checkout.line, checkout.line]] }]);
    expect(result.sessions.find((session) => session.sessionId === 'shop.checkout')).toMatchObject({
      hit: 'direct',
      units: expect.arrayContaining(['server-fn:ecommerce.checkout:ok']),
    });
  });

  it('ignores what a replay cannot show, and replays everything for a code file it does not know', () => {
    expect(relevant([{ file: 'src/client/app.routes.spec.ts' }, { file: 'README.md' }])).toMatchObject({
      sessions: [],
      ignoredFiles: ['src/client/app.routes.spec.ts', 'README.md'],
    });
    const unknown = relevant([{ file: `${repository}libs/core/src/lib/craft-state.ts`, lines: [[1, 1]] }]);
    expect(unknown.unmappedFiles).toHaveLength(1);
    expect(unknown.sessions.map((session) => session.hit)).toEqual(['unmapped', 'unmapped', 'unmapped']);
  });

  it('takes the whole file when the changed lines fall outside every node', () => {
    const button = node('template-element', (details) => details['localName'] === 'confirm-order');
    expect(hits(relevant([{ file: button.filePath, lines: [[1, 1]] }]))['shop.checkout']).toBe('direct');
  });
});
