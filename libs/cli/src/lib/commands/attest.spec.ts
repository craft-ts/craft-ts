import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runAttestCommand, type WorkspaceSlices } from './attest.js';
import type { CraftCliIo } from '../io.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const REPORT = {
  testResults: [
    {
      name: 'libs/core/src/lib/state.spec.ts',
      assertionResults: [
        { fullName: 'state > counts', status: 'passed' },
        { fullName: 'state > resets', status: 'passed' },
      ],
    },
  ],
};

async function workspace(): Promise<{
  root: string;
  io: CraftCliIo;
  out: string[];
  err: string[];
}> {
  const root = await mkdtemp(join(tmpdir(), 'craft-attest-cli-'));
  directories.push(root);
  await writeFile(join(root, 'report.json'), JSON.stringify(REPORT), 'utf8');
  const out: string[] = [];
  const err: string[] = [];
  return {
    root,
    out,
    err,
    io: {
      cwd: root,
      write: (text) => void out.push(text),
      writeError: (text) => void err.push(text),
    },
  };
}

const slices = (fingerprints: Readonly<Record<string, string>>): WorkspaceSlices => ({
  fingerprintFor: (file, fullName) => fingerprints[`${file}#${fullName}`] ?? 'code-1',
  leavesFor: (file, fullName) => ({
    [`body:${file}#${fullName}`]: fingerprints[`${file}#${fullName}`] ?? 'code-1',
    'libs/core/src/lib/state.ts#state:count': 'node-1',
  }),
  nodeHashes: () => ({ 'libs/core/src/lib/state.ts#state:count': 'node-1' }),
});

const dependencies = (fingerprints: Readonly<Record<string, string>> = {}) => ({
  loadSlices: async () => slices(fingerprints),
  now: () => '2026-09-05T09:00:00.000Z',
  user: () => 'romain',
});

describe('craft-ts attest', () => {
  it('reports every subject as missing before anything is attested', async () => {
    const { root, io, out } = await workspace();
    const code = await runAttestCommand(
      ['status', '--report', 'report.json'],
      io,
      dependencies(),
    );
    expect(code).toBe(1);
    expect(out[0]).toBe('current 0  renewed 0  review 0  missing 2');
    expect(out.join('\n')).toContain('test:libs/core/src/lib/state.spec.ts#state > counts');
    expect(root).toBeTypeOf('string');
  });

  it('records a verdict and then reports the subjects as current', async () => {
    const { root, io, out } = await workspace();
    await runAttestCommand(
      ['renew', '--all', '--report', 'report.json'],
      io,
      dependencies(),
    );
    expect(out.at(-1)).toContain('marked as a bulk renewal');

    const ledger = await readFile(join(root, '.craft/attestations.jsonl'), 'utf8');
    expect(ledger.split('\n').filter(Boolean)).toHaveLength(2);
    // The mark that keeps a bulk renewal from reading like somebody looking.
    expect(JSON.parse(ledger.split('\n')[0] as string).bulk).toBe(true);

    const second = await workspace();
    await writeFile(join(second.root, 'report.json'), JSON.stringify(REPORT), 'utf8');
    await writeFile(
      join(second.root, 'ledger.jsonl'),
      ledger,
      'utf8',
    );
    const code = await runAttestCommand(
      ['status', '--report', 'report.json', '--ledger', 'ledger.jsonl'],
      second.io,
      dependencies(),
    );
    expect(code).toBe(0);
    expect(second.out[0]).toBe('current 2  renewed 0  review 0  missing 0');
    expect(second.out.join('\n')).toContain('rest on a bulk renewal');
  });

  it('carries the judgement forward when only the code moved', async () => {
    const { root, io } = await workspace();
    await runAttestCommand(
      ['renew', '--all', '--report', 'report.json'],
      io,
      dependencies(),
    );

    const moved = await workspace();
    await writeFile(join(moved.root, 'report.json'), JSON.stringify(REPORT), 'utf8');
    await writeFile(
      join(moved.root, '.craft-ledger.jsonl'),
      await readFile(join(root, '.craft/attestations.jsonl'), 'utf8'),
      'utf8',
    );
    const code = await runAttestCommand(
      ['status', '--report', 'report.json', '--ledger', '.craft-ledger.jsonl'],
      moved.io,
      dependencies({
        'libs/core/src/lib/state.spec.ts#state > counts': 'code-2',
        'libs/core/src/lib/state.spec.ts#state > resets': 'code-2',
      }),
    );

    expect(code).toBe(0);
    expect(moved.out[0]).toBe('current 0  renewed 2  review 0  missing 0');
    expect(moved.out[1]).toContain('the code moved, the output did not');
  });

  it('names the nodes that moved when asked why', async () => {
    const { root, io } = await workspace();
    await runAttestCommand(
      ['renew', '--all', '--report', 'report.json'],
      io,
      dependencies(),
    );

    const asked = await workspace();
    await writeFile(join(asked.root, 'report.json'), JSON.stringify(REPORT), 'utf8');
    await writeFile(
      join(asked.root, 'ledger.jsonl'),
      await readFile(join(root, '.craft/attestations.jsonl'), 'utf8'),
      'utf8',
    );
    await rm(join(asked.root, '.craft'), { recursive: true, force: true });
    await runAttestCommand(
      [
        'why',
        'test:libs/core/src/lib/state.spec.ts#state > counts',
        '--report',
        'report.json',
        '--ledger',
        'ledger.jsonl',
        '--evidence',
        join(root, '.craft/evidence'),
      ],
      asked.io,
      dependencies(),
    );

    const text = asked.out.join('\n');
    expect(text).toContain("judged 'ok' by romain on 2026-09-05T09:00:00.000Z");
    expect(text).toContain('(bulk renewal)');
    expect(text).toContain('nothing in the slice moved');
  });

  it('refuses to guess what to look at', async () => {
    const { io, err } = await workspace();
    const code = await runAttestCommand(['status'], io, dependencies());
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Point --report at a test runner report');
  });

  it('rejects an unknown option instead of quietly checking something else', async () => {
    const { io, err } = await workspace();
    expect(await runAttestCommand(['status', '--nope'], io, dependencies())).toBe(1);
    expect(err[0]).toContain('--nope');
  });

  it('asks for a baseline before reporting what nobody is watching', async () => {
    const { io, err } = await workspace();
    const code = await runAttestCommand(['unwatched'], io, dependencies());
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('no baseline yet');
  });
});
