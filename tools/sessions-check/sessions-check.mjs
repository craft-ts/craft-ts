#!/usr/bin/env node
/**
 * `node tools/sessions-check/sessions-check.mjs --base <ref>`: the app's
 * regression suite, base against head, on this machine. The archive (the log
 * server) proposes the golden set of the app; each of its sessions is replayed
 * twice (`--noise-runs`) on the base — a ref checked out in a temporary worktree — and once on
 * the head — the working tree, or another ref —, then compared
 * (`runGoldenCheck` of `@craft-ts/playwright-sessions/suite`). The report
 * (markdown, JSON, pictures) is written to `--out`.
 *
 * `--select` chooses the suite and writes it next to the app
 * (`<app>/.craft/golden-set.json`): the sessions kept, with what each one
 * alone shows; the check replays that set while it is there, the archive's
 * proposal otherwise.
 *
 * `--approve <session>` approves the change the last check found in a session:
 * the difference itself is recorded in the attestation register
 * (`.craft/attestations.jsonl`), and the next check that finds it again
 * passes. A regression is never approved.
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
        node tools/sessions-check/sessions-check.mjs --approve <session> [--app <nom>]
        node tools/sessions-check/sessions-check.mjs --select [--app <nom>] [--max-sessions <n>]

  --base <ref>        la version de référence (commit, branche, tag), servie depuis un worktree temporaire
  --head <ref>        la version vérifiée ; l'arbre de travail par défaut
  --app <nom>         l'application (${Object.keys(SESSIONS_CHECK_APPS).join(', ')}) ; demo-ecommerce par défaut
  --sessions <ids>    des sessions précises, séparées par des virgules ; par défaut le golden set de l'app
                      (<app>/.craft/golden-set.json, écrit par --select), sinon celui que l'archive propose
  --changed           seulement les sessions que le changement de la base à la tête touche (graphe de l'app)
  --scope <dossier>   avec --changed : le dossier dont les changements comptent ; celui de l'app par défaut
  --list              avec --changed : dire quelles sessions seraient rejouées, sans rien rejouer
  --max-points <n>    moments photographiés par session (8 par défaut)
  --noise-runs <n>    rejeux de la base par session pour mesurer le bruit (2 par défaut, au moins 2 ;
                      3 pour une app animée)
  --out <dossier>     où écrire le rapport ; tmp/sessions-check/<app> par défaut (hors de git)
  --archive <url>     le serveur de logs (http://127.0.0.1:4319 par défaut)
  --dashboard <url>   le dashboard de rejeu (http://localhost:4210/ par défaut)
  --approve <session> approuver le changement que la dernière vérification a trouvé dans cette session
                      (son id, ou son début) : la différence précise entre au registre, pas la session
  --ledger <fichier>  le registre des approbations ; .craft/attestations.jsonl par défaut
  --select            choisir la suite de l'app et l'écrire dans <app>/.craft/golden-set.json : la suite en
                      place reste stable, les comportements qu'aucun test ne prouve passent d'abord
  --max-sessions <n>  avec --select : la taille maximale de la suite`;

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
    noiseRuns: 2,
    out: undefined,
    archive: 'http://127.0.0.1:4319',
    dashboard: 'http://localhost:4210/',
    approve: undefined,
    ledger: undefined,
    select: false,
    maxSessions: undefined,
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
      case '--noise-runs': {
        const value = Number(valueOf(index++, name));
        if (!Number.isInteger(value) || value < 2) throw new Error('--noise-runs attend un entier d’au moins 2 : le bruit se lit entre deux rejeux de la base.');
        options.noiseRuns = value;
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
      case '--approve':
        options.approve = valueOf(index++, name);
        break;
      case '--ledger':
        options.ledger = valueOf(index++, name);
        break;
      case '--select':
        options.select = true;
        break;
      case '--max-sessions': {
        const value = Number(valueOf(index++, name));
        if (!Number.isInteger(value) || value < 1) throw new Error('--max-sessions attend un entier positif.');
        options.maxSessions = value;
        break;
      }
      default:
        throw new Error(`Option inconnue : ${name}`);
    }
  }
  if (options.help) return options;
  if (!(options.app in SESSIONS_CHECK_APPS)) throw new Error(`Application inconnue : ${options.app}.`);
  if (options.maxSessions !== undefined && !options.select) throw new Error('--max-sessions va avec --select.');
  if (options.select) {
    if (options.base || options.head || options.changed || options.sessions || options.approve !== undefined)
      throw new Error('--select choisit la suite : sans --base, --head, --changed, --sessions ni --approve.');
    return options;
  }
  if (options.approve !== undefined) {
    if (options.base || options.head || options.changed || options.sessions)
      throw new Error('--approve porte sur la dernière vérification : sans --base, --head, --changed ni --sessions.');
    return options;
  }
  if (!options.base) throw new Error('--base est requis : la version à laquelle comparer.');
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
    noiseRuns: options.noiseRuns,
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
    out: outOf(options, resolved.repository),
    ledger: ledgerOf(options, resolved.repository),
    base: build(options.base, resolved.baseCommit),
    head: build(options.head, resolved.headCommit),
  };
}

/** Where the report of an app goes: out of git by default. */
export function outOf(options, repository) {
  return resolve(repository, options.out ?? join('tmp', 'sessions-check', options.app));
}

/** The attestation register the approvals are written to and read from. */
export function ledgerOf(options, repository) {
  return resolve(repository, options.ledger ?? join('.craft', 'attestations.jsonl'));
}

/**
 * The session of the last report `--approve` names (its id, or the start of
 * it), checked to be a change a person can approve. Throws a message for the
 * person otherwise: a regression is fixed, not approved.
 */
export function sessionToApprove(report, wanted) {
  const matches = report.sessions.filter((session) => session.sessionId === wanted || session.sessionId.startsWith(wanted));
  if (matches.length === 0) throw new Error(`La dernière vérification (${report.base} → ${report.head}) n’a pas rejoué de session « ${wanted} ».`);
  if (matches.length > 1) throw new Error(`« ${wanted} » désigne ${matches.length} sessions : donnez plus de caractères de l’id.`);
  const [session] = matches;
  const id = session.sessionId.slice(0, 8);
  if (session.verdict === 'regression')
    throw new Error(`${id} est une régression (${session.reason}) : elle se corrige, elle ne s’approuve pas.`);
  if (session.verdict !== 'changed') throw new Error(`${id} n’a pas de changement à approuver (${LABEL[session.verdict]}).`);
  if (session.approved) throw new Error(`Le changement de ${id} est déjà approuvé.`);
  if (!session.change) throw new Error(`Le rapport ne donne pas l’empreinte du changement de ${id} : relancez la vérification.`);
  return session;
}

const LABEL = { regression: 'régression', changed: 'changement', flaky: 'instable', stale: 'périmée', unchanged: 'inchangée' };

/** Where an app keeps its suite: the manifest `--select` writes. */
export function goldenSetFileOf(app, repository) {
  return resolve(repository, SESSIONS_CHECK_APPS[app].scope, '.craft', 'golden-set.json');
}

/** The sessions of a golden-set manifest, with what each one shows; undefined without one. */
export function manifestSessions(path) {
  if (!existsSync(path)) return undefined;
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest?.format !== 'craft-golden-set' || !Array.isArray(manifest.sessions)) throw new Error(`${path} n’est pas un manifeste de golden set.`);
  return manifest.sessions.map((session) => ({
    sessionId: session.sessionId,
    recordedAt: session.recordedAt,
    units: Array.isArray(session.units) ? session.units : [],
  }));
}

/** The suite in a few lines: what is kept, why, what is lost. */
export function summarizeSelection(selection, path) {
  const { manifest } = selection;
  return [
    `${manifest.sessions.length} session(s) gardée(s) sur ${selection.candidates ?? '?'} examinée(s) → ${path}`,
    ...manifest.sessions.map(
      (session) => `  ${session.sessionId.slice(0, 8)} · ${session.units.length} comportement(s), ${session.uniqueUnits.length} montré(s) par elle seule${session.uniqueUnits.length ? ` : ${session.uniqueUnits.slice(0, 3).join(', ')}${session.uniqueUnits.length > 3 ? '…' : ''}` : ''}`,
    ),
    ...(selection.rejected?.length ? [`${selection.rejected.length} laissée(s) de côté (doublon, redondante, non rejouable, au-delà de la taille).`] : []),
    ...(manifest.toRecapture.length ? [`À réenregistrer (plus aucune session ne les montre) : ${manifest.toRecapture.join(', ')}`] : []),
    ...(selection.priorityUnits?.length ? [`Comportements qu’aucun test ne prouve, choisis d’abord : ${selection.priorityUnits.length}.`] : []),
  ].join('\n');
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
  const approved = report.approved ?? 0;
  const counts = order.flatMap((verdict) => {
    const count = report.counts[verdict] - (verdict === 'changed' ? approved : 0);
    return [
      ...(count > 0 ? [`${LABEL[verdict]} ${count}`] : []),
      ...(verdict === 'changed' && approved > 0 ? [`changement approuvé ${approved}`] : []),
    ];
  });
  const toApprove = report.sessions.filter((session) => session.verdict === 'changed' && !session.approved);
  return [
    `${report.base} → ${report.head} : ${counts.join(' · ') || 'aucune session'}`,
    ...report.sessions
      .filter((session) => session.verdict !== 'unchanged')
      .map((session) => `  ${session.approved ? 'changement approuvé' : LABEL[session.verdict]} · ${session.sessionId.slice(0, 8)} · ${session.reason}`),
    `Rapport : ${markdownPath}`,
    report.passed
      ? approved > 0
        ? `Rien à corriger : ${approved} changement(s) déjà approuvé(s).`
        : 'Rien à corriger ni à approuver.'
      : 'À regarder : une régression, ou un changement que personne n’a approuvé.',
    ...(toApprove.length
      ? [`Voulu ? npm run sessions:check -- --approve <session>${report.app && report.app !== 'demo-ecommerce' ? ` --app ${report.app}` : ''} (${toApprove.map((session) => session.sessionId.slice(0, 8)).join(', ')})`]
      : []),
  ].join('\n');
}

/** Who approves: the name git commits with. */
function approver() {
  try {
    return execFileSync('git', ['-C', repository, 'config', 'user.name'], { encoding: 'utf8' }).trim() || 'inconnu';
  } catch {
    return process.env['USER'] ?? 'inconnu';
  }
}

/** The runner, on the plan written next to the report. */
function runRunner(plan) {
  mkdirSync(plan.out, { recursive: true });
  const planFile = join(plan.out, 'plan.json');
  writeFileSync(planFile, JSON.stringify(plan));
  return spawnSync(
    process.execPath,
    [join(repository, 'node_modules/@playwright/test/cli.js'), 'test', '--config', relative(repository, join(here, 'playwright.config.ts'))],
    { cwd: repository, stdio: 'inherit', env: { ...process.env, CRAFT_SESSIONS_CHECK: planFile } },
  );
}

/**
 * `--select`: the archive proposes the suite (the one in place kept stable,
 * the behaviours no test proves first) and it is written next to the app.
 */
async function select(options) {
  const out = outOf(options, repository);
  const file = goldenSetFileOf(options.app, repository);
  rmSync(join(out, 'selection.json'), { force: true });
  runRunner({
    repository,
    app: options.app,
    origin: SESSIONS_CHECK_APPS[options.app].origin,
    out,
    archive: options.archive,
    select: { appDir: resolve(repository, SESSIONS_CHECK_APPS[options.app].scope), ...(options.maxSessions ? { maxSessions: options.maxSessions } : {}) },
  });
  const selectionFile = join(out, 'selection.json');
  if (!existsSync(selectionFile)) {
    console.error('Le choix de la suite s’est arrêté sans résultat.');
    return 1;
  }
  const selection = JSON.parse(readFileSync(selectionFile, 'utf8'));
  if (selection.error) {
    console.error(selection.error);
    return 1;
  }
  console.log(`\n${summarizeSelection(selection, relative(process.cwd(), file))}`);
  return 0;
}

/**
 * `--approve`: the difference the last check found in a session enters the
 * register; the report is written again with it approved.
 */
async function approve(options) {
  const out = outOf(options, repository);
  const json = join(out, 'report.json');
  if (!existsSync(json)) throw new Error(`Aucune vérification de ${options.app} à approuver (${relative(process.cwd(), json)}) : lancez d’abord npm run sessions:check -- --base <ref>.`);
  const session = sessionToApprove(JSON.parse(readFileSync(json, 'utf8')), options.approve);
  rmSync(join(out, 'approval.json'), { force: true });
  runRunner({
    repository,
    app: options.app,
    origin: SESSIONS_CHECK_APPS[options.app].origin,
    out,
    ledger: ledgerOf(options, repository),
    approve: { sessionId: session.sessionId, by: approver() },
  });
  const approvalFile = join(out, 'approval.json');
  if (!existsSync(approvalFile)) {
    console.error('L’approbation s’est arrêtée sans rien écrire.');
    return 1;
  }
  const approval = JSON.parse(readFileSync(approvalFile, 'utf8'));
  if (!approval.approved) {
    console.error(approval.message);
    return 1;
  }
  console.log(
    `\nChangement de ${session.sessionId.slice(0, 8)} approuvé (moment(s) ${session.change.moments.join(', ')}, empreinte ${session.change.fingerprint.slice(0, 12)}) → ${relative(process.cwd(), approval.ledger)}.`,
  );
  const report = JSON.parse(readFileSync(json, 'utf8'));
  console.log(summarizeSessionsCheck(report, relative(process.cwd(), join(out, 'report.md'))));
  return 0;
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
  if (options.approve !== undefined) return approve(options);
  const app = SESSIONS_CHECK_APPS[options.app];
  if (options.select) {
    if (!(await answers(`${options.archive.replace(/\/$/, '')}/health`)))
      throw new Error(`Le serveur de logs ne répond pas sur ${options.archive} (npm run logs:server).`);
    return select(options);
  }
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
  // The suite the app keeps (`--select`), or the archive's proposal.
  const kept = manifestSessions(goldenSetFileOf(options.app, repository));
  const golden = kept ?? (await goldenSessions(options.archive, app.origin));
  const sessions = options.sessions
    ? options.sessions.map((sessionId) => golden.find((session) => session.sessionId === sessionId) ?? { sessionId, recordedAt: '', units: [] })
    : golden;
  if (sessions.length === 0) throw new Error(`L’archive ne propose aucune session pour ${app.origin}.`);
  const plan = sessionsCheckPlan(options, { repository, baseCommit, headCommit, sessions });
  console.log(
    `${sessions.length} session(s) ${kept ? `de la suite de l’app (${relative(process.cwd(), goldenSetFileOf(options.app, repository))})` : 'proposée(s) par l’archive'}${options.changed ? ', réduites à celles que le changement touche' : ''} · base ${plan.base.name} ×${plan.noiseRuns} · tête ${plan.head.name} ×1`,
  );
  // What an earlier run left must not pass for this one. The plan is a file:
  // the units of every session are too much for an environment variable.
  mkdirSync(plan.out, { recursive: true });
  for (const file of ['report.json', 'relevant.json', 'approval.json']) rmSync(join(plan.out, file), { force: true });
  const run = runRunner(plan);
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
