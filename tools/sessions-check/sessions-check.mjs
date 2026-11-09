#!/usr/bin/env node
/**
 * `node tools/sessions-check/sessions-check.mjs --base <ref>`: the app's
 * regression suite, base against head, on this machine. The archive (the log
 * server) proposes the golden set of the app; each of its sessions is replayed
 * twice on the base — a ref checked out in a temporary worktree — and once on
 * the head — the working tree, or another ref —, then compared
 * (`runGoldenCheck` of `@craft-ts/playwright-sessions/suite`). The report
 * (markdown, JSON, pictures) is written to `--out`.
 *
 * The replays run in the Playwright runner, which reads the TypeScript of the
 * workspace: this script resolves what to check and hands it over.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SESSIONS_CHECK_APPS } from './apps.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../..');

export const SESSIONS_CHECK_USAGE = `Usage : node tools/sessions-check/sessions-check.mjs --base <ref> [options]

  --base <ref>        la version de référence (commit, branche, tag), servie depuis un worktree temporaire
  --head <ref>        la version vérifiée ; l'arbre de travail par défaut
  --app <nom>         l'application (${Object.keys(SESSIONS_CHECK_APPS).join(', ')}) ; demo-ecommerce par défaut
  --sessions <ids>    des sessions précises, séparées par des virgules ; le golden set de l'archive par défaut
  --changed           seulement les sessions que le changement de la base à la tête touche (graphe de l'app)
  --scope <dossier>   avec --changed : le dossier dont les changements comptent ; celui de l'app par défaut
  --list              avec --changed : dire quelles sessions seraient rejouées, sans rien rejouer
  --max-points <n>    moments photographiés par session (8 par défaut)
  --out <dossier>     où écrire le rapport ; tmp/sessions-check/<app> par défaut (hors de git)
  --archive <url>     le serveur de logs (http://127.0.0.1:4319 par défaut)
  --dashboard <url>   le dashboard de rejeu (http://localhost:4210/ par défaut)`;

/** Reads the command line; throws a message for the person on a mistake. */
export function parseSessionsCheckArguments(argv) {
  const options = {
    app: 'demo-ecommerce',
    base: undefined,
    head: undefined,
    sessions: undefined,
    changed: false,
    scope: undefined,
    list: false,
    maxPoints: 8,
    out: undefined,
    archive: 'http://127.0.0.1:4319',
    dashboard: 'http://localhost:4210/',
    help: false,
  };
  const valueOf = (index, name) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${name} attend une valeur.`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    switch (name) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--base':
        options.base = valueOf(index++, name);
        break;
      case '--head':
        options.head = valueOf(index++, name);
        break;
      case '--app':
        options.app = valueOf(index++, name);
        break;
      case '--sessions':
        options.sessions = valueOf(index++, name).split(',').map((id) => id.trim()).filter(Boolean);
        break;
      case '--changed':
        options.changed = true;
        break;
      case '--scope':
        options.scope = valueOf(index++, name);
        break;
      case '--list':
        options.list = true;
        break;
      case '--max-points': {
        const value = Number(valueOf(index++, name));
        if (!Number.isInteger(value) || value < 1) throw new Error('--max-points attend un entier positif.');
        options.maxPoints = value;
        break;
      }
      case '--out':
        options.out = valueOf(index++, name);
        break;
      case '--archive':
        options.archive = valueOf(index++, name);
        break;
      case '--dashboard':
        options.dashboard = valueOf(index++, name);
        break;
      default:
        throw new Error(`Option inconnue : ${name}`);
    }
  }
  if (options.help) return options;
  if (!options.base) throw new Error('--base est requis : la version à laquelle comparer.');
  if (!(options.app in SESSIONS_CHECK_APPS)) throw new Error(`Application inconnue : ${options.app}.`);
  if ((options.scope !== undefined || options.list) && !options.changed)
    throw new Error('--scope et --list vont avec --changed.');
  return options;
}

/** The commit a ref names, so the base cannot move while the suite runs. */
export function resolveCommit(ref, cwd = repository) {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error(`« ${ref} » ne nomme aucun commit de ce dépôt.`);
  }
}

/** What the runner checks: the builds, the sessions, where the report goes. */
export function sessionsCheckPlan(options, resolved) {
  const app = SESSIONS_CHECK_APPS[options.app];
  const build = (ref, commit) =>
    ref === undefined
      ? { name: 'arbre de travail' }
      : { name: `${ref} (${commit.slice(0, 9)})`, ref: commit };
  return {
    repository: resolved.repository,
    app: options.app,
    origin: app.origin,
    command: app.command,
    dashboardUrl: options.dashboard,
    sessionIds: resolved.sessions.map((session) => session.sessionId),
    maxPoints: options.maxPoints,
    ...(options.changed
      ? {
          changed: {
            // What the units of each session are matched against.
            sessions: resolved.sessions,
            tsconfig: resolve(resolved.repository, app.tsconfig),
            scope: resolve(resolved.repository, options.scope ?? app.scope),
            list: options.list,
          },
        }
      : {}),
    out: resolve(resolved.repository, options.out ?? join('tmp', 'sessions-check', options.app)),
    base: build(options.base, resolved.baseCommit),
    head: build(options.head, resolved.headCommit),
  };
}

/** The golden set the archive proposes for the app: the sessions it keeps, with what each one shows. */
export async function goldenSessions(archive, origin, fetchImpl = fetch) {
  const response = await fetchImpl(`${archive.replace(/\/$/, '')}/sessions/golden-set`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ origin }),
  });
  if (!response.ok) throw new Error(`L’archive refuse le golden set (${response.status}).`);
  const body = await response.json();
  return (body?.manifest?.sessions ?? []).map((session) => ({
    sessionId: session.sessionId,
    recordedAt: session.recordedAt,
    units: Array.isArray(session.units) ? session.units : [],
  }));
}

/** Which sessions a change touches, and why, in a few lines. */
export function summarizeRelevantSessions(relevant) {
  const changed = relevant.changed.map((node) => `${node.kind}:${node.label}`);
  return [
    `${relevant.sessions.length} session(s) touchée(s), ${relevant.untouched} non touchée(s) · ${relevant.changes} fichier(s) changé(s)`,
    ...(changed.length ? [`Nœuds changés : ${changed.slice(0, 8).join(', ')}${changed.length > 8 ? ` (+${changed.length - 8})` : ''}`] : []),
    ...(relevant.unmappedFiles.length ? [`Inconnus du graphe (toutes les sessions comptent) : ${relevant.unmappedFiles.join(', ')}`] : []),
    ...relevant.sessions.map(
      (session) => `  ${session.hit} · ${session.sessionId.slice(0, 8)} · ${session.units.slice(0, 3).join(', ')}${session.because.length ? ` ← ${session.because.slice(0, 3).join(', ')}` : ''}`,
    ),
  ].join('\n');
}

/** The report in a few lines, and whether the check passed. */
export function summarizeSessionsCheck(report, markdownPath) {
  const order = ['regression', 'changed', 'flaky', 'stale', 'unchanged'];
  const label = { regression: 'régression', changed: 'changement', flaky: 'instable', stale: 'périmée', unchanged: 'inchangée' };
  const counts = order.filter((verdict) => report.counts[verdict] > 0).map((verdict) => `${label[verdict]} ${report.counts[verdict]}`);
  return [
    `${report.base} → ${report.head} : ${counts.join(' · ') || 'aucune session'}`,
    ...report.sessions
      .filter((session) => session.verdict !== 'unchanged')
      .map((session) => `  ${label[session.verdict]} · ${session.sessionId.slice(0, 8)} · ${session.reason}`),
    `Rapport : ${markdownPath}`,
    report.passed ? 'Rien à corriger ni à approuver.' : 'À regarder : une régression, ou un changement que personne n’a approuvé.',
  ].join('\n');
}

async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

async function main(argv) {
  const options = parseSessionsCheckArguments(argv);
  if (options.help) {
    console.log(SESSIONS_CHECK_USAGE);
    return 0;
  }
  const app = SESSIONS_CHECK_APPS[options.app];
  if (!(await answers(`${options.archive.replace(/\/$/, '')}/health`)))
    throw new Error(`Le serveur de logs ne répond pas sur ${options.archive} (npm run logs:server).`);
  const replays = !options.list;
  if (replays && !(await answers(options.dashboard)))
    throw new Error(`Le dashboard de rejeu ne répond pas sur ${options.dashboard}.`);
  // Each build is served there in turn: whatever runs there now must stop.
  if (replays && (await answers(`${app.origin}/`)))
    throw new Error(`${app.origin} répond déjà : arrêtez le serveur de ${options.app}, chaque version y sera servie à son tour.`);
  const baseCommit = resolveCommit(options.base);
  const headCommit = options.head === undefined ? undefined : resolveCommit(options.head);
  const golden = await goldenSessions(options.archive, app.origin);
  const sessions = options.sessions
    ? options.sessions.map((sessionId) => golden.find((session) => session.sessionId === sessionId) ?? { sessionId, recordedAt: '', units: [] })
    : golden;
  if (sessions.length === 0) throw new Error(`L’archive ne propose aucune session pour ${app.origin}.`);
  const plan = sessionsCheckPlan(options, { repository, baseCommit, headCommit, sessions });
  console.log(
    `${sessions.length} session(s)${options.changed ? ', réduites à celles que le changement touche' : ''} · base ${plan.base.name} ×2 · tête ${plan.head.name} ×1`,
  );
  // What an earlier run left must not pass for this one. The plan is a file:
  // the units of every session are too much for an environment variable.
  mkdirSync(plan.out, { recursive: true });
  for (const file of ['report.json', 'relevant.json']) rmSync(join(plan.out, file), { force: true });
  const planFile = join(plan.out, 'plan.json');
  writeFileSync(planFile, JSON.stringify(plan));
  const run = spawnSync(
    process.execPath,
    [join(repository, 'node_modules/@playwright/test/cli.js'), 'test', '--config', relative(repository, join(here, 'playwright.config.ts'))],
    { cwd: repository, stdio: 'inherit', env: { ...process.env, CRAFT_SESSIONS_CHECK: planFile } },
  );
  if (options.list) {
    const relevantFile = join(plan.out, 'relevant.json');
    if (!existsSync(relevantFile)) {
      console.error('La sélection s’est arrêtée sans résultat.');
      return run.status || 1;
    }
    console.log(`\n${summarizeRelevantSessions(JSON.parse(readFileSync(relevantFile, 'utf8')))}`);
    return 0;
  }
  const json = join(plan.out, 'report.json');
  if (!existsSync(json)) {
    console.error('La vérification s’est arrêtée sans rapport.');
    return run.status || 1;
  }
  const report = JSON.parse(readFileSync(json, 'utf8'));
  console.log(`\n${summarizeSessionsCheck(report, relative(process.cwd(), join(plan.out, 'report.md')))}`);
  const relevantFile = join(plan.out, 'relevant.json');
  if (options.changed && existsSync(relevantFile)) {
    const relevant = JSON.parse(readFileSync(relevantFile, 'utf8'));
    console.log(`${relevant.untouched} session(s) que le changement ne touche pas : non rejouée(s) (${relative(process.cwd(), relevantFile)}).`);
  }
  return report.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    },
  );
}
