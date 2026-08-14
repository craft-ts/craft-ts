#!/usr/bin/env node

import {
  writeDependencyGraph,
  type WriteDependencyGraphOptions,
} from '../scripts/dependency-graph.js';

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
          throw new Error('--format must be json, mermaid, html, both, or all.');
        }
        options.format = format;
        break;
      }
      case '--include':
        options.include = [...(options.include ?? []), argv[++index]];
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

Builds a static Craft NG dependency graph from TypeScript and type metadata.
No runtime instrumentation is used.

Options:
  --project, --tsconfig <path> TypeScript application config.
  --root <dir>                 Workspace root. Defaults to cwd.
  --out <path>                 Output basename. Defaults to craft-dependency-graph.
  --format <format>            json, mermaid, html, both, or all. Defaults to both.
                               json/both/all also write a .architecture.ts catalog.
                               html creates one self-contained visualizer file.
  --include <text>             Restrict analysis to source paths containing text.
`);
}

writeDependencyGraph(parseArgs(process.argv.slice(2)))
  .then((graph) => {
    console.log(
      `Craft graph written: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`,
    );
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
