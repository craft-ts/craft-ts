#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import {
  writeDependencyGraph,
  type WriteDependencyGraphOptions,
} from '../scripts/dependency-graph.js';
import type { StyleDump } from '../scripts/style-graph.js';
import {
  styleDebt,
  styleImpact,
  styleMatrix,
} from '../scripts/style-report.js';

const DEFAULT_STYLE_DUMP = 'tmp/craft-style-graph.json';

/**
 * The style questions answer from the dump alone.
 *
 * They deliberately do **not** build the TypeScript program: the whole point of
 * asking "what does this token change affect?" is to answer it in the time it
 * takes to decide whether to run the visual suite. A question that costs a full
 * typecheck gets asked once and then never again.
 */
function runStyleQuery(argv: string[]): boolean {
  const impacted: string[] = [];
  let dumpPath = DEFAULT_STYLE_DUMP;
  let mode: 'impacted' | 'matrix' | 'debt' | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    switch (argv[index]) {
      case '--impacted':
        mode = 'impacted';
        impacted.push(argv[++index]);
        break;
      case '--style-matrix':
        mode = 'matrix';
        break;
      case '--style-debt':
        mode = 'debt';
        break;
      case '--style-dump':
        dumpPath = argv[++index];
        break;
      default:
        break;
    }
  }
  if (!mode) return false;

  let dump: StyleDump;
  try {
    dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as StyleDump;
  } catch {
    throw new Error(
      `craft-graph: no style dump at '${dumpPath}'. It is written by the build plugin — give craftStyle({ dumpPath }) a path, run a build, or point at it with --style-dump.`,
    );
  }

  const report =
    mode === 'impacted'
      ? styleImpact(dump, impacted)
      : mode === 'matrix'
        ? styleMatrix(dump)
        : styleDebt(dump);
  console.log(JSON.stringify(report, null, 2));
  return true;
}

function parseArgs(argv: string[]): WriteDependencyGraphOptions {
  const options: WriteDependencyGraphOptions = {
    rootDir: process.cwd(),
    outputPath: 'craft-dependency-graph',
    format: 'both',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--project':
      case '--tsconfig':
        options.tsConfigFilePath = argv[++index];
        break;
      case '--root':
        options.rootDir = argv[++index];
        break;
      case '--out':
        options.outputPath = argv[++index];
        break;
      case '--format': {
        const format = argv[++index];
        if (
          format !== 'json' &&
          format !== 'mermaid' &&
          format !== 'html' &&
          format !== 'both' &&
          format !== 'all'
        ) {
          throw new Error(
            '--format must be json, mermaid, html, both, or all.',
          );
        }
        options.format = format;
        break;
      }
      case '--include':
        options.include = [...(options.include ?? []), argv[++index]];
        break;
      case '--style-dump':
        index += 1;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function printHelp(): void {
  console.log(`Usage: craft-graph [options]

Builds a static CraftTS dependency graph from TypeScript and type metadata.
No runtime instrumentation is used.

Options:
  --project, --tsconfig <path> TypeScript application config.
  --root <dir>                 Workspace root. Defaults to cwd.
  --out <path>                 Output basename. Defaults to craft-dependency-graph.
  --format <format>            json, mermaid, html, both, or all. Defaults to both.
                               json/both/all also write a .architecture.ts catalog.
                               html creates one self-contained visualizer file.
  --include <text>             Restrict analysis to source paths containing text.

Style queries, answered from the emitted dump without building the program:
  --impacted <--x>             Sheet classes a change to that custom property
                               can be seen in. Repeatable. Falls back to "all"
                               — and says so — for a name the graph does not know.
  --style-matrix               What the application costs to capture.
  --style-debt                 Escape hatches, unmet obligations, dangling
                               variables, and the components nobody styles.
  --style-dump <path>          Defaults to ${DEFAULT_STYLE_DUMP}.
`);
}

const argv = process.argv.slice(2);

if (!runStyleQuery(argv)) {
  writeDependencyGraph(parseArgs(argv))
    .then((graph) => {
      console.log(
        `Craft graph written: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`,
      );
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
