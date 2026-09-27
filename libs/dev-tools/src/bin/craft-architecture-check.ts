#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  analyzeDependencyGraph,
} from '../scripts/dependency-graph.js';
import {
  assertArchitecture,
  type ArchitectureCheckTarget,
} from '../scripts/architecture-graph.js';
import {
  architectureWaivers,
  type ArchitectureWaiver,
} from '../scripts/architecture-waivers.js';
import { mergeStyleDump, type StyleDump } from '../scripts/style-graph.js';

type Options = {
  rootDir: string;
  tsConfigFilePath?: string;
  target: ArchitectureCheckTarget;
  styleDumpPath?: string;
  projectDir?: string;
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
    if (argument === '--style-dump') {
      options.styleDumpPath = argv[++index];
      continue;
    }
    if (argument === '--project-dir') {
      options.projectDir = argv[++index];
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
  --style-dump <path>          The style dump the build wrote (craftStyle({ dumpPath })).
                               Without it, the style rules cannot see what the sheets emit.
  --project-dir <dir>          Where architecture/waivers.ts lives. Defaults to the
                               directory of the TypeScript project.
`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const analyzed = analyzeDependencyGraph(options);
  const graph = options.styleDumpPath
    ? mergeStyleDump(
        analyzed,
        JSON.parse(
          readFileSync(resolve(options.rootDir, options.styleDumpPath), 'utf8'),
        ) as StyleDump,
      )
    : analyzed;
  const projectDir = resolve(
    options.rootDir,
    options.projectDir ?? dirname(analyzed.tsConfigFilePath),
  );
  // Read statically, like the attestation does: the check never executes the
  // app's code to learn what it waives.
  const waivers = architectureWaivers(projectDir).map(
    ({ rule, target, reason }) => ({ rule, target, reason }),
  ) as ArchitectureWaiver[];
  assertArchitecture(graph, { target: options.target, waivers });
  console.log(
    `Craft architecture check passed for ${options.target}: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
