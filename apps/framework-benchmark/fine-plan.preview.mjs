#!/usr/bin/env node
// PROTOTYPE preview: servers and temporary runtime copies are removed on Ctrl+C.
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath, [join(app, 'diagnose.mjs')], {
  cwd: resolve(app, '../..'),
  stdio: 'inherit',
  env: {
    ...process.env,
    CRAFT_MOUNT_DIAG_VARIANTS: process.env.CRAFT_MOUNT_DIAG_VARIANTS ?? 'shape-lean,fine-reference,fine-grouped',
    CRAFT_MOUNT_DIAG_CASES: '[]',
    CRAFT_MOUNT_DIAG_RUNS: '1',
    CRAFT_MOUNT_DIAG_ITERATIONS: '2',
    CRAFT_MOUNT_DIAG_OUTPUT: process.env.CRAFT_MOUNT_DIAG_OUTPUT ?? 'tmp/fine-plan/preview',
    CRAFT_MOUNT_DIAG_MODE: 'timing',
    CRAFT_FINE_FANOUT: 'true',
    CRAFT_FINE_PREVIEW: 'true',
    CRAFT_FLOOR_CONTRACTS: 'false',
    CRAFT_NEXT_CONTRACTS: 'false',
  },
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
