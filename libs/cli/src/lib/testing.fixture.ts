import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CraftCliIo } from './io.js';

export type TemporaryWorkspace = Readonly<{
  root: string;
  write(path: string, content: string): string;
  dispose(): void;
}>;

export function createTemporaryWorkspace(): TemporaryWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'craft-cli-'));
  return {
    root,
    write(path, content) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, 'utf8');
      return target;
    },
    dispose() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export type CapturedIo = CraftCliIo &
  Readonly<{
    output: string[];
    errors: string[];
    all(): string;
  }>;

/** Captures what the CLI prints instead of writing to the process streams. */
export function captureIo(cwd: string): CapturedIo {
  const output: string[] = [];
  const errors: string[] = [];
  return {
    cwd,
    output,
    errors,
    write: (text) => {
      output.push(text);
    },
    writeError: (text) => {
      errors.push(text);
    },
    all: () => [...output, ...errors].join('\n'),
  };
}
