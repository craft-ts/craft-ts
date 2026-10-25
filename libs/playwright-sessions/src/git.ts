import { execFileSync } from 'node:child_process';

export type GitState = Readonly<{ sha: string; dirty: boolean }>;

/**
 * Commit and cleanliness of the checkout, read once per worker. The histories
 * themselves (`__sessions__`) never make the tree dirty: they are what a green
 * run writes. Outside a git checkout: `unknown` and clean, never an error.
 */
export function readGitState(cwd = process.cwd(), run: typeof execFileSync = execFileSync): GitState {
  try {
    const sha = run('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const status = run('git', ['status', '--porcelain', '--', ':/', ':(top,exclude,glob)**/__sessions__/**'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return { sha: sha || 'unknown', dirty: status.trim().length > 0 };
  } catch {
    return { sha: 'unknown', dirty: false };
  }
}
