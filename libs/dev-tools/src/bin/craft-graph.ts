#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import {
  analyzeDependencyGraph,
  writeDependencyGraph,
  type WriteDependencyGraphOptions,
} from '../scripts/dependency-graph.js';
import { mergeStyleDump, type StyleDump } from '../scripts/style-graph.js';
import {
  paletteContrastMatrix,
  styleDebt,
  styleImpact,
  styleMatrix,
} from '../scripts/style-report.js';
import {
  analyzeTextContrast,
  formatTextContrastReport,
  textContrastExitCode,
  textContrastReport,
} from '../scripts/style-contrast.js';

const DEFAULT_STYLE_DUMP = 'tmp/craft-style-graph.json';

function readDump(path: string): StyleDump {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as StyleDump;
  } catch {
    throw new Error(
      `craft-graph: no style dump at '${path}'. It is written by the build plugin — give craftStyle({ dumpPath }) a path, run a build, or point at it with --style-dump.`,
    );
  }
}

/**
 * The style questions answer from the dump alone.
 *
 * They deliberately do **not** build the TypeScript program: the whole point of
 * asking "what does this token change affect?" is to answer it in the time it
 * takes to decide whether to run the visual suite. A question that costs a full
 * typecheck gets asked once and then never again.
 *
 * `--style-contrast` is the exception and is handled separately: a contrast
 * proof needs to know which element carries which class and what sits above
 * it, and no dump has ever seen a template.
 */
function runStyleQuery(argv: string[]): boolean {
  const impacted: string[] = [];
  let dumpPath = DEFAULT_STYLE_DUMP;
  let mode: 'impacted' | 'matrix' | 'debt' | 'palette' | undefined;

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
      case '--palette-contrast':
        mode = 'palette';
        break;
      case '--style-dump':
        dumpPath = argv[++index];
        break;
      default:
        break;
    }
  }
  if (!mode) return false;

  const dump = readDump(dumpPath);
  const report =
    mode === 'impacted'
      ? styleImpact(dump, impacted)
      : mode === 'matrix'
        ? styleMatrix(dump)
        : mode === 'palette'
          ? paletteContrastMatrix(dump)
          : styleDebt(dump);
  console.log(JSON.stringify(report, null, 2));
  return true;
}

/* ------------------------------------------------------------------------ *
 * Contrast
 * ------------------------------------------------------------------------ */

interface ContrastRun {
  readonly dumpPath: string;
  readonly json: boolean;
  /**
   * Whether a result nobody could prove is allowed through.
   *
   * Off by default, and the flag has to be typed. A tool whose default is
   * "unknown counts as fine" reports a clean bill on an application it
   * understood half of, which is the failure mode this whole analysis exists
   * to avoid — a green check that means nothing.
   */
  readonly allowIndeterminate: boolean;
  readonly graph: WriteDependencyGraphOptions;
}

function parseContrastRun(argv: string[]): ContrastRun | undefined {
  if (!argv.includes('--style-contrast')) return undefined;
  const graph: WriteDependencyGraphOptions = {
    rootDir: process.cwd(),
    outputPath: 'craft-dependency-graph',
    format: 'json',
  };
  let dumpPath = DEFAULT_STYLE_DUMP;
  let json = false;
  let allowIndeterminate = false;

  for (let index = 0; index < argv.length; index += 1) {
    switch (argv[index]) {
      case '--style-contrast':
        break;
      case '--style-dump':
        dumpPath = argv[++index];
        break;
      case '--json':
        json = true;
        break;
      case '--allow-indeterminate':
        allowIndeterminate = true;
        break;
      case '--project':
      case '--tsconfig':
        graph.tsConfigFilePath = argv[++index];
        break;
      case '--root':
        graph.rootDir = argv[++index];
        break;
      case '--include':
        graph.include = [...(graph.include ?? []), argv[++index]];
        break;
      default:
        throw new Error(
          `craft-graph --style-contrast: unknown argument ${argv[index]}.`,
        );
    }
  }
  return { dumpPath, json, allowIndeterminate, graph };
}

function runContrast(run: ContrastRun): number {
  const dump = readDump(run.dumpPath);
  const graph = mergeStyleDump(
    analyzeDependencyGraph({
      rootDir: run.graph.rootDir,
      ...(run.graph.tsConfigFilePath
        ? { tsConfigFilePath: run.graph.tsConfigFilePath }
        : {}),
      ...(run.graph.include ? { include: run.graph.include } : {}),
    }),
    dump,
  );
  const report = textContrastReport(analyzeTextContrast(graph, dump), {
    allowIndeterminate: run.allowIndeterminate,
  });
  console.log(
    run.json
      ? JSON.stringify(report, null, 2)
      : formatTextContrastReport(report),
  );
  return textContrastExitCode(report);
}

/* ------------------------------------------------------------------------ *
 * The graph itself
 * ------------------------------------------------------------------------ */

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
  --palette-contrast           Every colour pair the palette can express, with
                               its light and dark ratios. Informative: it never
                               fails the run, because a pair nobody renders is
                               not a bug.
  --style-dump <path>          Defaults to ${DEFAULT_STYLE_DUMP}.

Text contrast, which does build the program because it needs the templates:
  --style-contrast             Proves WCAG 2.2 AA text contrast for every
                               element the graph knows holds text, in every
                               scenario the sheets can produce. Exits non-zero
                               on a violation.
  --json                       Machine-readable report, stable across runs.
  --allow-indeterminate        Downgrade unprovable results from error to
                               warning. Off by default: a check whose default
                               treats "unknown" as "fine" reports a clean bill
                               on an application it understood half of.
`);
}

const argv = process.argv.slice(2);

const contrast = parseContrastRun(argv);
if (contrast) {
  try {
    process.exitCode = runContrast(contrast);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
} else if (!runStyleQuery(argv)) {
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
