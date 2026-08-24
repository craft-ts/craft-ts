import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const nxBin = resolve(workspaceRoot, 'node_modules/nx/bin/nx.js');
const craftBin = resolve(
  workspaceRoot,
  'dist/libs/dev-tools/src/bin/craft.js',
);
const graphProjects = [
  {
    project: 'apps/demo/tsconfig.app.json',
    output: 'craft-dependency-graph',
  },
  {
    project: 'apps/demo-effect/tsconfig.graph.json',
    output: 'craft-dependency-graph.demo-effect',
  },
  {
    project: 'apps/demo-with-server-function/tsconfig.graph.json',
    output: 'craft-dependency-graph.demo-with-server-function',
  },
];

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  return result.status ?? 1;
}

let exitCode = 0;

try {
  exitCode = runNode([nxBin, 'build', 'dev-tools']);
  if (exitCode !== 0) throw new Error('La construction de dev-tools a échoué.');

  for (const { project, output } of graphProjects) {
    exitCode = runNode([
      craftBin,
      'graph',
      '--project',
      project,
      '--root',
      '.',
      '--out',
      output,
      '--format',
      'all',
    ]);
    if (exitCode !== 0) throw new Error(`Le graphe ${project} a échoué.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode ||= 1;
}

process.exitCode = exitCode;
