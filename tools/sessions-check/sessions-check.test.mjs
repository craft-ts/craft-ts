import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  goldenSessions,
  parseSessionsCheckArguments,
  resolveCommit,
  sessionsCheckPlan,
  summarizeRelevantSessions,
  summarizeSessionsCheck,
} from './sessions-check.mjs';

test('reads the command line, and refuses what it cannot check', () => {
  const options = parseSessionsCheckArguments(['--base', 'main', '--sessions', 'a, b,', '--max-points', '3']);
  assert.equal(options.base, 'main');
  assert.equal(options.head, undefined);
  assert.equal(options.app, 'demo-ecommerce');
  assert.deepEqual(options.sessions, ['a', 'b']);
  assert.equal(options.maxPoints, 3);
  assert.throws(() => parseSessionsCheckArguments([]), /--base est requis/);
  assert.throws(() => parseSessionsCheckArguments(['--base']), /--base attend une valeur/);
  assert.throws(() => parseSessionsCheckArguments(['--base', 'main', '--app', 'autre']), /Application inconnue/);
  assert.throws(() => parseSessionsCheckArguments(['--base', 'main', '--max-points', '0']), /entier positif/);
  assert.throws(() => parseSessionsCheckArguments(['--base', 'main', '--vite']), /Option inconnue/);
  assert.throws(() => parseSessionsCheckArguments(['--base', 'main', '--list']), /vont avec --changed/);
  assert.deepEqual(
    (({ changed, scope, list }) => ({ changed, scope, list }))(parseSessionsCheckArguments(['--base', 'main', '--changed', '--scope', 'libs/ui', '--list'])),
    { changed: true, scope: 'libs/ui', list: true },
  );
  assert.equal(parseSessionsCheckArguments(['--help']).help, true);
});

test('pins each ref to its commit, and names the working tree when no head is given', () => {
  const repository = mkdtempSync(join(tmpdir(), 'sessions-check-'));
  try {
    const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
    git('init', '-q');
    writeFileSync(join(repository, 'a.txt'), 'a');
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'a');
    const commit = git('rev-parse', 'HEAD');
    assert.equal(resolveCommit('HEAD', repository), commit);
    assert.throws(() => resolveCommit('nulle-part', repository), /ne nomme aucun commit/);
    const plan = sessionsCheckPlan(parseSessionsCheckArguments(['--base', 'HEAD']), {
      repository,
      baseCommit: commit,
      headCommit: undefined,
      sessions: [{ sessionId: 's1', recordedAt: '2026-11-08', units: ['route:/'] }],
    });
    assert.deepEqual(plan.base, { name: `HEAD (${commit.slice(0, 9)})`, ref: commit });
    assert.deepEqual(plan.head, { name: 'arbre de travail' });
    assert.equal(plan.origin, 'http://localhost:4204');
    // Out of git by default.
    assert.equal(plan.out, join(repository, 'tmp', 'sessions-check', 'demo-ecommerce'));
    assert.deepEqual(plan.sessionIds, ['s1']);
    assert.equal(plan.changed, undefined);
    // `--changed`: the units to match, the app's graph, the app's folder.
    const changed = sessionsCheckPlan(parseSessionsCheckArguments(['--base', 'HEAD', '--changed']), {
      repository,
      baseCommit: commit,
      headCommit: undefined,
      sessions: [{ sessionId: 's1', recordedAt: '2026-11-08', units: ['route:/'] }],
    }).changed;
    assert.deepEqual(changed, {
      sessions: [{ sessionId: 's1', recordedAt: '2026-11-08', units: ['route:/'] }],
      tsconfig: join(repository, 'apps/demo-ecommerce/tsconfig.json'),
      scope: join(repository, 'apps/demo-ecommerce'),
      list: false,
    });
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test('asks the archive for the golden set of the app’s origin, with what each session shows', async () => {
  const asked = [];
  const sessions = await goldenSessions('http://archive/', 'http://localhost:4204', async (url, init) => {
    asked.push([url, JSON.parse(init.body)]);
    return {
      ok: true,
      json: async () => ({ manifest: { sessions: [{ sessionId: 's1', recordedAt: 'r1', units: ['route:/'] }, { sessionId: 's2', recordedAt: 'r2' }] } }),
    };
  });
  assert.deepEqual(sessions, [
    { sessionId: 's1', recordedAt: 'r1', units: ['route:/'] },
    { sessionId: 's2', recordedAt: 'r2', units: [] },
  ]);
  assert.deepEqual(asked, [['http://archive/sessions/golden-set', { origin: 'http://localhost:4204' }]]);
  await assert.rejects(goldenSessions('http://archive', 'o', async () => ({ ok: false, status: 400 })), /refuse le golden set \(400\)/);
});

test('words the report: the verdicts, the sessions to look at, where it is', () => {
  const summary = summarizeSessionsCheck(
    {
      base: 'main (abc)',
      head: 'arbre de travail',
      passed: false,
      counts: { regression: 1, changed: 0, flaky: 0, stale: 0, unchanged: 2 },
      sessions: [
        { sessionId: '7661f6f7-aaaa', verdict: 'regression', reason: 'la tête diverge à l’action 12' },
        { sessionId: '12f3fde3-bbbb', verdict: 'unchanged', reason: '' },
      ],
    },
    'tmp/report.md',
  );
  assert.match(summary, /main \(abc\) → arbre de travail : régression 1 · inchangée 2/);
  assert.match(summary, /régression · 7661f6f7 · la tête diverge/);
  assert.doesNotMatch(summary, /12f3fde3/);
  assert.match(summary, /Rapport : tmp\/report\.md/);
  assert.match(summary, /À regarder/);
});

test('says which sessions a change touches, and why', () => {
  const summary = summarizeRelevantSessions({
    changes: 1,
    changed: [{ kind: 'component', label: 'EcommerceFormulaComposer' }],
    unmappedFiles: [],
    untouched: 7,
    sessions: [{ sessionId: '801744a1-aaaa', hit: 'direct', units: ['interaction:EcommerceFormulaComposer:button:add-formula:click'], because: ['template-element:add-formula'] }],
  });
  assert.match(summary, /1 session\(s\) touchée\(s\), 7 non touchée\(s\) · 1 fichier\(s\) changé\(s\)/);
  assert.match(summary, /Nœuds changés : component:EcommerceFormulaComposer/);
  assert.match(summary, /direct · 801744a1 · interaction:EcommerceFormulaComposer:button:add-formula:click ← template-element:add-formula/);
  assert.doesNotMatch(summary, /Inconnus du graphe/);
  assert.match(summarizeRelevantSessions({ changes: 1, changed: [], unmappedFiles: ['src/app.css'], untouched: 0, sessions: [] }), /Inconnus du graphe \(toutes les sessions comptent\) : src\/app\.css/);
});
