import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseCraftSessionAnnotation } from './contract.js';
import { historyBytes, readHistory } from './history-store.js';

const execFileAsync = promisify(execFile);
export type PlaywrightListing = { config: { rootDir?: string; projects: Array<{ name: string; testDir: string }> }; suites: Suite[] };
type Suite = { title?: string; file?: string; specs?: Spec[]; suites?: Suite[] };
type Spec = { title: string; file?: string; tests: Array<{ projectName: string; annotations: Array<{ type: string; description?: string }> }> };

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'tmp', '.git', '.nx', '__sessions__']);
const FIXTURE_USE = /@craft-ts\/playwright-sessions|\bcraftSession\(/;

/**
 * The Playwright configs of the workspace whose tests use the craft-session
 * fixture: uniqueness of the ids is checked across all of them.
 */
export function findCraftSessionConfigs(workspaceRoot: string): string[] {
  const configs: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name) || relative(workspaceRoot, path) === join('.claude', 'worktrees') || entry.name.startsWith('.references')) continue;
        visit(path);
      } else if (entry.name === 'playwright.config.ts' && usesFixture(testDirOf(path))) {
        configs.push(relative(workspaceRoot, path));
      }
    }
  };
  visit(workspaceRoot);
  return configs.sort();
}

export type E2eSessionContractOptions = Readonly<{
  /** Defaults to every config `findCraftSessionConfigs` finds. */
  configs?: readonly string[];
  workspaceRoot: string;
  budgetBytes?: Readonly<{ session: number; test: number }>;
  /** `playwright test --list --reporter=json`, replaceable in tests. */
  list?: (config: string) => Promise<PlaywrightListing>;
}>;

/** Fails on every broken invariant; returns the warnings that do not block. */
export async function assertE2eSessionContract(options: E2eSessionContractOptions): Promise<Readonly<{ warnings: readonly string[] }>> {
  const problems: string[] = [];
  const warnings: string[] = [];
  const declared = new Map<string, string>();
  const testDirs = new Map<string, Set<string>>();
  const checkedTestRoots = new Set<string>();
  const list = options.list ?? ((config: string) => listTests(config, options.workspaceRoot));
  for (const config of options.configs ?? findCraftSessionConfigs(options.workspaceRoot)) {
    let listing: PlaywrightListing;
    try { listing = await list(config); }
    catch (error) {
      problems.push(`${config}: Playwright --list a échoué (${error instanceof Error ? error.message : String(error)}).`);
      continue;
    }
    const rootDir = resolve(options.workspaceRoot, listing.config.rootDir ?? dirname(config));
    const projectNames = new Set(listing.config.projects.map((project) => project.name));
    const visit = (suite: Suite, titleParts: string[]): void => {
      const nextTitles = suite.title && suite.title !== suite.file ? [...titleParts, suite.title] : titleParts;
      for (const spec of suite.specs ?? []) for (const test of spec.tests) {
        const file = resolve(rootDir, spec.file ?? suite.file ?? '<spec>');
        const titlePath = [...nextTitles, spec.title].join(' › ');
        // A file path and a title path: two apps may each have a checkout.spec.ts.
        const testIdentity = `${relative(options.workspaceRoot, file)} › ${titlePath}`;
        let contract;
        try { contract = parseCraftSessionAnnotation(test.annotations, testIdentity); }
        catch (error) { problems.push(error instanceof Error ? error.message : String(error)); continue; }
        const previous = declared.get(contract.id);
        if (previous && previous !== testIdentity) problems.push(`id craftSession dupliqué "${contract.id}" : ${previous} et ${testIdentity}.`);
        declared.set(contract.id, testIdentity);
        const projectTestDir = listing.config.projects.find((project) => project.name === test.projectName)?.testDir;
        if (!projectTestDir) continue;
        const dirs = testDirs.get(projectTestDir) ?? new Set<string>();
        dirs.add(test.projectName); testDirs.set(projectTestDir, dirs);
        if (contract.capture === 'none') continue;
        const testRoot = join(projectTestDir, '__sessions__', contract.id);
        if (!existsSync(testRoot) || checkedTestRoots.has(testRoot)) continue;
        checkedTestRoots.add(testRoot);
        for (const project of readdirSync(testRoot, { withFileTypes: true })) {
          if (!project.isDirectory()) continue;
          if (!projectNames.has(project.name)) problems.push(`Projet Playwright inconnu dans l'historique ${testRoot}/${project.name}.`);
          const dir = join(testRoot, project.name);
          const historyPath = join(dir, 'history.json');
          if (!existsSync(historyPath)) { problems.push(`history.json manquant : ${historyPath}.`); continue; }
          try {
            const history = readHistory(dir);
            if (!history) continue;
            if (history.id !== contract.id || history.project !== project.name) problems.push(`Identité history.json incohérente : ${historyPath}.`);
            if (history.keep !== contract.keep) problems.push(`keep de history.json différent de l'annotation : ${historyPath}.`);
            if (history.runs.length > history.keep) problems.push(`Trop de runs dans ${historyPath}.`);
            if (contract.keep === 1 && history.runs.some((run) => run.retry > 0))
              warnings.push(`${contract.id} (${project.name}) : la référence vient d'un retry alors que keep vaut 1 ; un test instable devrait garder plusieurs runs (keep > 1 et reason).`);
            const files = new Set(history.runs.map((run) => run.file));
            for (const run of history.runs) {
              const path = join(dir, run.file);
              if (!existsSync(path)) problems.push(`Session manquante : ${path}.`);
              else if (options.budgetBytes && statSync(path).size > options.budgetBytes.session) problems.push(`Session au-dessus du budget : ${path}.`);
            }
            for (const name of readdirSync(dir).filter((name) => name.endsWith('.session.json.gz') && !files.has(name))) problems.push(`Fichier de session non référencé : ${join(dir, name)}.`);
          } catch (error) { problems.push(error instanceof Error ? error.message : String(error)); }
        }
        // Once per test directory, all projects together.
        const bytes = readdirSync(testRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).reduce((total, entry) => total + historyBytes(join(testRoot, entry.name)), 0);
        if (options.budgetBytes && bytes > options.budgetBytes.test) problems.push(`Historique du test au-dessus du budget : ${testRoot} (${bytes} octets).`);
      }
      for (const child of suite.suites ?? []) visit(child, nextTitles);
    };
    for (const suite of listing.suites) visit(suite, []);
  }
  for (const [testDir] of testDirs) {
    const root = join(testDir, '__sessions__');
    if (!existsSync(root)) continue;
    for (const id of readdirSync(root, { withFileTypes: true }))
      if (id.isDirectory() && !declared.has(id.name)) problems.push(`Historique orphelin : ${join(root, id.name)} (renommez le dossier vers le nouvel id ou supprimez-le).`);
  }
  if (problems.length) throw new Error(`Contrat e2e craft-session invalide :\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  for (const warning of warnings) console.warn(`[craft-sessions] ${warning}`);
  return { warnings };
}

async function listTests(config: string, cwd: string): Promise<PlaywrightListing> {
  const { stdout } = await execFileAsync('npx', ['playwright', 'test', '--list', '--reporter=json', '-c', config], { cwd, maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(stdout) as PlaywrightListing;
}

/** `testDir` as the config writes it, relative to the config; its folder otherwise. */
function testDirOf(configPath: string): string {
  const match = /\btestDir\s*:\s*['"`]([^'"`]+)['"`]/.exec(readFileSync(configPath, 'utf8'));
  return resolve(dirname(configPath), match?.[1] ?? '.');
}

function usesFixture(directory: string): boolean {
  if (!existsSync(directory)) return false;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIPPED_DIRECTORIES.has(entry.name) && usesFixture(join(directory, entry.name))) return true; continue; }
    if (/\.[cm]?[jt]s$/.test(entry.name) && FIXTURE_USE.test(readFileSync(join(directory, entry.name), 'utf8'))) return true;
  }
  return false;
}
