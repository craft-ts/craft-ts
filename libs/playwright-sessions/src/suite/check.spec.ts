import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { commandServer, gitWorktreeServer } from './check.js';

const repository = fileURLToPath(new URL('../../../..', import.meta.url));

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/** A one-line HTTP server that answers with the directory it runs in. */
const httpServer = (port: number) =>
  `node -e "require('http').createServer((q, r) => r.end(process.cwd())).listen(${port}, '127.0.0.1')"`;

describe('commandServer', () => {
  it('serves until stopped, and frees the address', async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    const served = await commandServer({ command: httpServer(port), url, timeoutMs: 10_000 })();
    expect((await fetch(url)).ok).toBe(true);
    await served.stop();
    await expect(fetch(url)).rejects.toThrow();
  });

  it('refuses an address another server already holds', async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    const first = await commandServer({ command: httpServer(port), url, timeoutMs: 10_000 })();
    try {
      await expect(commandServer({ command: httpServer(port), url })()).rejects.toThrow('répond déjà');
    } finally {
      await first.stop();
    }
  });

  it('says when the command dies before serving', async () => {
    const port = await freePort();
    await expect(commandServer({ command: 'exit 3', url: `http://127.0.0.1:${port}/`, timeoutMs: 5_000 })()).rejects.toThrow('code 3');
  });
});

describe('gitWorktreeServer', () => {
  it('serves another commit from a temporary worktree, and removes it', async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    const worktrees = () => execFileSync('git', ['-C', repository, 'worktree', 'list'], { encoding: 'utf8' });
    const served = await gitWorktreeServer({ ref: 'HEAD', repository, command: httpServer(port), url, timeoutMs: 20_000 })();
    let directory = '';
    try {
      directory = await (await fetch(url)).text();
      expect(directory).toContain('craft-golden-base-');
      expect(worktrees()).toContain(directory.replace(/^\/private/, ''));
    } finally {
      await served.stop();
    }
    expect(worktrees()).not.toContain(directory.replace(/^\/private/, ''));
  }, 60_000);
});
