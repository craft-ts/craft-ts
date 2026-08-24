#!/usr/bin/env node

import {
  analyzeDependencyGraph,
} from '../scripts/dependency-graph.js';
import {
  assertArchitecture,
  type ArchitectureCheckTarget,
} from '../scripts/architecture-graph.js';

type Options = {
  rootDir: string;
  tsConfigFilePath?: string;
  target: ArchitectureCheckTarget;
};

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    rootDir: process.cwd(),
    target: 'development',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') {
      options.rootDir = argv[++index] ?? options.rootDir;
      continue;
    }
    if (argument === '--project' || argument === '--tsconfig') {
      options.tsConfigFilePath = argv[++index];
      continue;
    }
    if (argument === '--target') {
      const target = argv[++index];
      if (target !== 'development' && target !== 'production') {
        throw new Error('--target must be development or production.');
      }
      options.target = target;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      console.log(`Usage: craft-architecture-check [options]

Options:
  --root <dir>                 Workspace root. Defaults to cwd.
  --project, --tsconfig <path> TypeScript project configuration.
  --target <target>            development or production. Defaults to development.
`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const graph = analyzeDependencyGraph(options);
  assertArchitecture(graph, { target: options.target });
  console.log(
    `Craft architecture check passed for ${options.target}: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
