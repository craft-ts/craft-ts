import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  goldenSessions,
  parseSessionsCheckArguments,
  goldenSetFileOf,
  ledgerOf,
  manifestSessions,
  resolveCommit,
  sessionToApprove,
  sessionsCheckPlan,
  summarizeRelevantSessions,
  summarizeSelection,
  summarizeSessionsCheck,
} from './sessions-check.mjs';

test('reads the command line, and refuses what it cannot check', () => {
  const options = parseSessionsCheckArguments(['--base', 'main', '--sessions', 'a, b,', '--max-points', '3']);
  assert.equal(options.base, 'main');
  assert.equal(options.head, undefined);
  assert.equal(options.app, 'demo-ecommerce');
  assert.deepEqual(options.sessions, ['a', 'b']);
  assert.equal(options.maxPoints, 3);
  assert.equal(options.noiseRuns, 2);
  assert.equal(parseSessionsCheckArguments(['--base', 'main', '--noise-runs', '3']).noiseRuns, 3);
  assert.throws(() => parseSessionsCheckArguments(['--base', 'main', '--noise-runs', '1']), /au moins 2/);
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
    assert.equal(plan.noiseRuns, 2);
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

test('--approve names a session of the last check; a regression is never approved', () => {
  const options = parseSessionsCheckArguments(['--approve', '801744a1']);
  assert.equal(options.approve, '801744a1');
  assert.equal(ledgerOf(options, '/repo'), '/repo/.craft/attestations.jsonl');
  assert.throws(() => parseSessionsCheckArguments(['--approve', 'x', '--base', 'main']), /dernière vérification/);
  const report = {
    base: 'main (abc)',
    head: 'arbre de travail',
    sessions: [
      { sessionId: '801744a1-aaaa', verdict: 'changed', reason: '2 moment(s) sur 8 diffèrent', change: { moments: [3, 5], fingerprint: 'f1' } },
      { sessionId: '801744b2-bbbb', verdict: 'regression', reason: 'la tête s’écarte de l’enregistrement à l’action 4' },
      { sessionId: 'c0ffee00-cccc', verdict: 'changed', reason: '1 moment', change: { moments: [1], fingerprint: 'f2' }, approved: true },
      { sessionId: 'd00d0000-dddd', verdict: 'unchanged', reason: '' },
    ],
  };
  assert.equal(sessionToApprove(report, '801744a1').sessionId, '801744a1-aaaa');
  assert.throws(() => sessionToApprove(report, '801744'), /désigne 2 sessions/);
  assert.throws(() => sessionToApprove(report, '801744b2'), /régression .* ne s’approuve pas/);
  assert.throws(() => sessionToApprove(report, 'c0ffee00'), /déjà approuvé/);
  assert.throws(() => sessionToApprove(report, 'd00d0000'), /pas de changement à approuver \(inchangée\)/);
  assert.throws(() => sessionToApprove(report, 'nope'), /n’a pas rejoué de session « nope »/);
  assert.throws(() => sessionToApprove({ ...report, sessions: [{ ...report.sessions[0], change: undefined }] }, '801744a1'), /relancez/);
});

test('words an approved change apart, and passes when every change is approved', () => {
  const approved = summarizeSessionsCheck(
    {
      base: 'main (abc)',
      head: 'logo (f2c)',
      passed: true,
      approved: 1,
      counts: { regression: 0, changed: 1, flaky: 0, stale: 0, unchanged: 10 },
      sessions: [{ sessionId: '801744a1-aaaa', verdict: 'changed', approved: true, reason: '2 moment(s) sur 8 diffèrent' }],
    },
    'tmp/report.md',
  );
  assert.match(approved, /main \(abc\) → logo \(f2c\) : changement approuvé 1 · inchangée 10/);
  assert.match(approved, /changement approuvé · 801744a1/);
  assert.match(approved, /Rien à corriger : 1 changement\(s\) déjà approuvé\(s\)/);
  assert.doesNotMatch(approved, /--approve/);
  const fresh = summarizeSessionsCheck(
    {
      base: 'main (abc)',
      head: 'logo (f2c)',
      passed: false,
      approved: 1,
      counts: { regression: 0, changed: 2, flaky: 0, stale: 0, unchanged: 9 },
      sessions: [
        { sessionId: '801744a1-aaaa', verdict: 'changed', approved: true, reason: '' },
        { sessionId: '12f3fde3-bbbb', verdict: 'changed', reason: '1 moment(s) sur 8 diffèrent' },
      ],
    },
    'tmp/report.md',
  );
  assert.match(fresh, /changement 1 · changement approuvé 1 · inchangée 9/);
  assert.match(fresh, /npm run sessions:check -- --approve <session> \(12f3fde3\)/);
});

test('--select writes the suite next to the app, and the check replays it while it is there', () => {
  assert.equal(parseSessionsCheckArguments(['--select', '--max-sessions', '5']).maxSessions, 5);
  assert.throws(() => parseSessionsCheckArguments(['--select', '--base', 'main']), /choisit la suite/);
  assert.throws(() => parseSessionsCheckArguments(['--base', 'main', '--max-sessions', '5']), /va avec --select/);
  assert.equal(goldenSetFileOf('demo-ecommerce', '/repo'), '/repo/apps/demo-ecommerce/.craft/golden-set.json');

  const directory = mkdtempSync(join(tmpdir(), 'sessions-select-'));
  try {
    const file = join(directory, 'golden-set.json');
    assert.equal(manifestSessions(file), undefined);
    writeFileSync(file, JSON.stringify({ format: 'craft-golden-set', sessions: [{ sessionId: 's1', recordedAt: 'r1', units: ['route:/'], uniqueUnits: [] }] }));
    assert.deepEqual(manifestSessions(file), [{ sessionId: 's1', recordedAt: 'r1', units: ['route:/'] }]);
    writeFileSync(file, '{"format":"autre"}');
    assert.throws(() => manifestSessions(file), /n’est pas un manifeste/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  const summary = summarizeSelection(
    {
      candidates: 15,
      manifest: {
        sessions: [{ sessionId: '801744a1-aaaa', units: ['a', 'b', 'c', 'd'], uniqueUnits: ['a', 'b', 'c', 'd'] }],
        toRecapture: ['route:/admin'],
      },
      rejected: [{ sessionId: 'x', reason: 'duplicate' }],
      priorityUnits: ['invocation:cart.add#failed'],
    },
    'apps/demo-ecommerce/.craft/golden-set.json',
  );
  assert.match(summary, /1 session\(s\) gardée\(s\) sur 15 examinée\(s\) → apps\/demo-ecommerce\/.craft\/golden-set.json/);
  assert.match(summary, /801744a1 · 4 comportement\(s\), 4 montré\(s\) par elle seule : a, b, c…/);
  assert.match(summary, /1 laissée\(s\) de côté/);
  assert.match(summary, /À réenregistrer .* route:\/admin/);
  assert.match(summary, /aucun test ne prouve, choisis d’abord : 1/);
});
