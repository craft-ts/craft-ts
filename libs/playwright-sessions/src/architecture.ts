import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseCraftSessionAnnotation } from './contract.js';
import { historyBytes, readHistory } from './history-store.js';

const execFileAsync = promisify(execFile);
type ListResult = { config: { projects: Array<{ name: string; testDir: string }> }; suites: Suite[] };
type Suite = { title?: string; file?: string; specs?: Spec[]; suites?: Suite[] };
type Spec = { title: string; tests: Array<{ projectName: string; annotations: Array<{ type: string; description?: string }> }> };

export async function assertE2eSessionContract(options: {
  configs: readonly string[];
  workspaceRoot: string;
  budgetBytes?: { session: number; test: number };
}): Promise<void> {
  const problems: string[] = [];
  const declared = new Map<string, string>();
  const testDirs = new Map<string, Set<string>>();
  for (const config of options.configs) {
    let listing: ListResult;
    try {
      const { stdout } = await execFileAsync('npx', ['playwright', 'test', '--list', '--reporter=json', '-c', config], { cwd: options.workspaceRoot, maxBuffer: 32 * 1024 * 1024 });
      listing = JSON.parse(stdout) as ListResult;
    } catch (error) {
      problems.push(`${config}: Playwright --list a échoué (${error instanceof Error ? error.message : String(error)}).`);
      continue;
    }
    const projectNames = new Set(listing.config.projects.map((project) => project.name));
    const visit = (suite: Suite, titleParts: string[]): void => {
      const nextTitles = suite.title && suite.title !== suite.file ? [...titleParts, suite.title] : titleParts;
      for (const spec of suite.specs ?? []) for (const test of spec.tests) {
        const annotations = test.annotations.filter((annotation) => annotation.type === 'craft-session');
        const label = `${suite.file ?? '<spec>'} › ${[...nextTitles, spec.title].join(' › ')}`;
        let contract;
        try { contract = parseCraftSessionAnnotation(annotations, label); }
        catch (error) { problems.push(error instanceof Error ? error.message : String(error)); continue; }
        const testIdentity = `${suite.file}:${[...nextTitles, spec.title].join(' › ')}`;
        const previous = declared.get(contract.id);
        if (previous && previous !== testIdentity) problems.push(`id craftSession dupliqué "${contract.id}" : ${previous} et ${testIdentity}.`);
        declared.set(contract.id, testIdentity);
        const projectTestDir = listing.config.projects.find((project) => project.name === test.projectName)?.testDir;
        if (projectTestDir) {
          const dirs = testDirs.get(projectTestDir) ?? new Set<string>();
          dirs.add(test.projectName); testDirs.set(projectTestDir, dirs);
          if (contract.capture === 'none') continue;
          const testRoot = join(projectTestDir, '__sessions__', contract.id);
          if (!existsSync(testRoot)) continue;
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
              const files = new Set(history.runs.map((run) => run.file));
              for (const run of history.runs) {
                const path = join(dir, run.file);
                if (!existsSync(path)) problems.push(`Session manquante : ${path}.`);
                else if (options.budgetBytes && statSync(path).size > options.budgetBytes.session) problems.push(`Session au-dessus du budget : ${path}.`);
              }
              for (const name of readdirSync(dir).filter((name) => name.endsWith('.session.json.gz') && !files.has(name))) problems.push(`Fichier de session non référencé : ${join(dir, name)}.`);
              if (options.budgetBytes && historyBytes(testRoot) > options.budgetBytes.test) problems.push(`Historique du test au-dessus du budget : ${testRoot}.`);
            } catch (error) { problems.push(error instanceof Error ? error.message : String(error)); }
          }
        }
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
}

