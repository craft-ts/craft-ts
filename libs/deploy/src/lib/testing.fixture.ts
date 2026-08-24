import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export type TemporaryWorkspace = Readonly<{
  root: string;
  write(path: string, content: string): string;
  mkdir(path: string): string;
  dispose(): void;
}>;

/** Creates a throwaway directory the filesystem-aware checks can walk. */
export function createTemporaryWorkspace(): TemporaryWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'craft-deploy-'));
  return {
    root,
    write(path, content) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, 'utf8');
      return target;
    },
    mkdir(path) {
      const target = join(root, path);
      mkdirSync(target, { recursive: true });
      return target;
    },
    dispose() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
