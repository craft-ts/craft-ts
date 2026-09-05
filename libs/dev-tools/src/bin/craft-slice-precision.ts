#!/usr/bin/env node
/**
 * Replays the repository's history and measures how precise a code slice is.
 *
 * Slow on purpose: it builds the dependency graph once per revision, because
 * anything cheaper would be measuring an approximation of the thing whose
 * approximation error is exactly what we want to know.
 *
 *   npx tsx libs/dev-tools/src/bin/craft-slice-precision.ts \
 *     --tsconfig apps/demo/tsconfig.graph.json --commits 20
 */
import process from 'node:process';
import {
  formatSlicePrecision,
  measureSlicePrecision,
} from '../scripts/slice-precision.js';

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

const report = measureSlicePrecision({
  rootDir: argument('root') ?? process.cwd(),
  tsConfigFilePath: argument('tsconfig') ?? 'tsconfig.json',
  commits: Number(argument('commits') ?? 20),
  onProgress: (message) => process.stderr.write(`${message}\n`),
});

process.stdout.write(`${formatSlicePrecision(report)}\n`);
process.exit(report.withinBudget ? 0 : 1);
