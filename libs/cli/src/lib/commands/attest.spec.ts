import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

const visualRun = (color = 'rgb(0, 0, 0)') => ({
  format: 'craft-ts-visual-report',
  version: 1,
  captures: [
    {
      component: 'component:apps/demo/card.ts:Card',
      scenario: 'base',
      digest: {
        digestVersion: 1,
        nodes: [{ path: 'card', styles: { color } }],
        signature: {
          columns: {},
          lines: {},
          wrapped: [],
          clipped: [],
          scrollbars: [],
          overlaps: [],
        },
      },
      image: 'card.png',
    },
  ],
});

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

const slices = (
  fingerprints: Readonly<Record<string, string>>,
): WorkspaceSlices => ({
  fingerprintFor: (file, fullName) =>
    fingerprints[`${file}#${fullName}`] ?? 'code-1',
  leavesFor: (file, fullName) => ({
    [`body:${file}#${fullName}`]:
      fingerprints[`${file}#${fullName}`] ?? 'code-1',
    'libs/core/src/lib/state.ts#state:count': 'node-1',
  }),
  fingerprintForNode: (nodeId) => fingerprints[nodeId] ?? 'visual-code-1',
  leavesForNode: (nodeId) => ({
    [nodeId]: fingerprints[nodeId] ?? 'visual-code-1',
  }),
  templateObligations: () => [
    {
      subject:
        'template:component:apps/demo/card.ts:Card#command:property:apps/demo/card.ts:save',
      direction: 'command',
      component: 'component:apps/demo/card.ts:Card',
      target: 'property:apps/demo/card.ts:save',
      targetKind: 'property',
      element: 'button',
      elementName: 'save',
      statement: "button 'save' in Card's template invokes save.",
    },
  ],
  templateDiagnostics: () => [],
  fingerprintForTemplate: (subject) =>
    fingerprints[subject] ?? 'template-code-1',
  leavesForTemplate: (subject) => ({
    [`site:${subject}`]: fingerprints[subject] ?? 'template-code-1',
  }),
  nodeHashes: () => ({ 'libs/core/src/lib/state.ts#state:count': 'node-1' }),
});

const dependencies = (fingerprints: Readonly<Record<string, string>> = {}) => ({
  loadSlices: async () => slices(fingerprints),
  now: () => '2026-09-05T09:00:00.000Z',
  user: () => 'romain',
});

const withoutTemplateObligations = () => ({
  ...dependencies(),
  loadSlices: async () => ({
    ...slices({}),
    templateObligations: () => [],
  }),
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
    expect(out.join('\n')).toContain(
      'test:libs/core/src/lib/state.spec.ts#state > counts',
    );
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

    const ledger = await readFile(
      join(root, '.craft/attestations.jsonl'),
      'utf8',
    );
    expect(ledger.split('\n').filter(Boolean)).toHaveLength(2);
    // The mark that keeps a bulk renewal from reading like somebody looking.
    expect(JSON.parse(ledger.split('\n')[0] as string).bulk).toBe(true);

    const second = await workspace();
    await writeFile(
      join(second.root, 'report.json'),
      JSON.stringify(REPORT),
      'utf8',
    );
    await writeFile(join(second.root, 'ledger.jsonl'), ledger, 'utf8');
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
    await writeFile(
      join(moved.root, 'report.json'),
      JSON.stringify(REPORT),
      'utf8',
    );
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

  it('attests a visual report, stores its evidence, and carries it across code movement', async () => {
    const { root, io, out } = await workspace();
    await writeFile(
      join(root, 'report.json'),
      JSON.stringify(visualRun()),
      'utf8',
    );
    await writeFile(join(root, 'card.png'), new Uint8Array([137, 80, 78, 71]));

    expect(
      await runAttestCommand(
        ['renew', '--all', '--report', 'report.json'],
        io,
        dependencies(),
      ),
    ).toBe(0);
    const ledgerText = await readFile(
      join(root, '.craft/attestations.jsonl'),
      'utf8',
    );
    const attestation = JSON.parse(ledgerText.trim());
    expect(attestation.subject).toBe(
      'visual:component:apps/demo/card.ts:Card#base',
    );
    expect(
      await readFile(
        join(
          root,
          '.craft/evidence',
          attestation.evidence.slice(0, 2),
          `${attestation.evidence}.digest.json`,
        ),
        'utf8',
      ),
    ).toContain('digestVersion');

    out.splice(0);
    expect(
      await runAttestCommand(
        ['status', '--report', 'report.json'],
        io,
        dependencies({ 'component:apps/demo/card.ts:Card': 'visual-code-2' }),
      ),
    ).toBe(0);
    expect(out[0]).toBe('current 0  renewed 1  review 0  missing 0');
  });

  it('queues a visual report when its digest changed', async () => {
    const { root, io, out } = await workspace();
    await writeFile(
      join(root, 'report.json'),
      JSON.stringify(visualRun()),
      'utf8',
    );
    await writeFile(join(root, 'card.png'), new Uint8Array([137, 80, 78, 71]));
    await runAttestCommand(
      ['renew', '--all', '--report', 'report.json'],
      io,
      dependencies(),
    );

    await writeFile(
      join(root, 'report.json'),
      JSON.stringify(visualRun('rgb(255, 0, 0)')),
      'utf8',
    );
    out.splice(0);
    expect(
      await runAttestCommand(
        ['status', '--report', 'report.json'],
        io,
        dependencies({ 'component:apps/demo/card.ts:Card': 'visual-code-2' }),
      ),
    ).toBe(1);
    expect(out[0]).toBe('current 0  renewed 0  review 1  missing 0');
    expect(out.join('\n')).toContain('the output changed');
  });

  it('keeps the last accepted proof when a changed output is rejected', async () => {
    const { root, io } = await workspace();
    await writeFile(
      join(root, 'report.json'),
      JSON.stringify(visualRun()),
      'utf8',
    );
    await writeFile(join(root, 'card.png'), new Uint8Array([137, 80, 78, 71]));
    await runAttestCommand(
      ['renew', '--all', '--report', 'report.json'],
      io,
      dependencies(),
    );
    const accepted = JSON.parse(
      await readFile(join(root, '.craft/attestations.jsonl'), 'utf8'),
    );

    await writeFile(
      join(root, 'report.json'),
      JSON.stringify(visualRun('rgb(255, 0, 0)')),
      'utf8',
    );
    await runAttestCommand(
      [
        'renew',
        '--subject',
        accepted.subject,
        '--report',
        'report.json',
        '--verdict',
        'rejected',
        '--note',
        'The new colour is wrong.',
      ],
      io,
      dependencies({ 'component:apps/demo/card.ts:Card': 'visual-code-2' }),
    );
    const rejected = JSON.parse(
      await readFile(join(root, '.craft/attestations.jsonl'), 'utf8'),
    );

    expect(rejected.evidence).not.toBe(accepted.evidence);
    expect(rejected.acceptedReference).toEqual({
      fingerprint: accepted.fingerprint,
      evidence: accepted.evidence,
    });
  });

  it('names the nodes that moved when asked why', async () => {
    const { root, io } = await workspace();
    await runAttestCommand(
      ['renew', '--all', '--report', 'report.json'],
      io,
      dependencies(),
    );

    const asked = await workspace();
    await writeFile(
      join(asked.root, 'report.json'),
      JSON.stringify(REPORT),
      'utf8',
    );
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

  it('requires and exposes the reason for a rejected verdict', async () => {
    const { root, io, out, err } = await workspace();

    expect(
      await runAttestCommand(
        ['renew', '--all', '--report', 'report.json', '--verdict', 'rejected'],
        io,
        dependencies(),
      ),
    ).toBe(1);
    expect(err.join('\n')).toContain('--note is required');

    expect(
      await runAttestCommand(
        [
          'renew',
          '--all',
          '--report',
          'report.json',
          '--verdict',
          'rejected',
          '--note',
          'The result hides the primary action.',
        ],
        io,
        dependencies(),
      ),
    ).toBe(0);

    out.splice(0);
    expect(
      await runAttestCommand(
        ['status', '--report', 'report.json'],
        io,
        dependencies(),
      ),
    ).toBe(1);
    expect(out.join('\n')).toContain(
      'rejection reason: The result hides the primary action.',
    );

    out.splice(0);
    expect(
      await runAttestCommand(
        [
          'why',
          'test:libs/core/src/lib/state.spec.ts#state > counts',
          '--report',
          'report.json',
        ],
        io,
        dependencies(),
      ),
    ).toBe(0);
    expect(out.join('\n')).toContain(
      'decision reason: The result hides the primary action.',
    );
    expect(root).toBeTypeOf('string');
  });

  it('refuses to guess what to look at', async () => {
    const { io, err } = await workspace();
    const code = await runAttestCommand(['status'], io, dependencies());
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('Point --report at Vitest JSON');
  });

  it('derives template subjects without a report', async () => {
    const { root, io, out } = await workspace();
    const code = await runAttestCommand(
      ['status', '--kind', 'template'],
      io,
      dependencies(),
    );

    expect(code).toBe(1);
    expect(out[0]).toBe('current 0  renewed 0  review 0  missing 1');
    expect(out.join('\n')).toContain(
      'template:component:apps/demo/card.ts:Card',
    );
    const shards = await readdir(join(root, '.craft/evidence'));
    const evidenceFiles = (
      await Promise.all(
        shards.map(
          async (shard) => await readdir(join(root, '.craft/evidence', shard)),
        ),
      )
    ).flat();
    expect(evidenceFiles.some((file) => file.endsWith('.template.json'))).toBe(
      true,
    );
  });

  it('combines visual and template subjects with --kind all', async () => {
    const { root, io, out } = await workspace();
    await writeFile(
      join(root, 'report.json'),
      JSON.stringify(visualRun()),
      'utf8',
    );
    await writeFile(join(root, 'card.png'), new Uint8Array([137, 80, 78, 71]));

    expect(
      await runAttestCommand(
        ['status', '--kind', 'all', '--report', 'report.json'],
        io,
        dependencies(),
      ),
    ).toBe(1);
    expect(out[0]).toBe('current 0  renewed 0  review 0  missing 2');
  });

  it('blocks an unsigned template removal and accepts a signed retirement', async () => {
    const { root, io, out, err } = await workspace();
    await runAttestCommand(
      ['renew', '--all', '--kind', 'template'],
      io,
      dependencies(),
    );
    out.splice(0);

    expect(
      await runAttestCommand(
        ['status', '--kind', 'template'],
        io,
        withoutTemplateObligations(),
      ),
    ).toBe(1);
    expect(out.join('\n')).toContain('sign the removal with `attest retire`');

    const subject =
      'template:component:apps/demo/card.ts:Card#command:property:apps/demo/card.ts:save';
    expect(
      await runAttestCommand(
        [
          'retire',
          '--kind',
          'template',
          '--subject',
          subject,
          '--reason',
          'superseded',
        ],
        io,
        withoutTemplateObligations(),
      ),
    ).toBe(1);
    expect(err.join('\n')).toContain('non-empty --note');

    expect(
      await runAttestCommand(
        [
          'retire',
          '--kind',
          'template',
          '--subject',
          subject,
          '--reason',
          'superseded',
          '--note',
          'Saving is automatic now.',
        ],
        io,
        withoutTemplateObligations(),
      ),
    ).toBe(0);
    const ledger = await readFile(
      join(root, '.craft/attestations.jsonl'),
      'utf8',
    );
    expect(JSON.parse(ledger).retired).toMatchObject({
      reason: 'superseded',
      note: 'Saving is automatic now.',
      by: 'romain',
    });

    out.splice(0);
    expect(
      await runAttestCommand(
        ['status', '--kind', 'template'],
        io,
        withoutTemplateObligations(),
      ),
    ).toBe(0);
  });

  it('queues a retired obligation if it reappears', async () => {
    const { root, io, out } = await workspace();
    await runAttestCommand(
      ['renew', '--all', '--kind', 'template'],
      io,
      dependencies(),
    );
    const subject =
      'template:component:apps/demo/card.ts:Card#command:property:apps/demo/card.ts:save';
    await runAttestCommand(
      [
        'retire',
        '--kind',
        'template',
        '--subject',
        subject,
        '--reason',
        'defect',
        '--note',
        'The action was exposed by mistake.',
      ],
      io,
      withoutTemplateObligations(),
    );
    out.splice(0);

    expect(
      await runAttestCommand(
        ['status', '--kind', 'template'],
        io,
        dependencies(),
      ),
    ).toBe(1);
    expect(out.join('\n')).toContain('the retired obligation reappeared');

    expect(
      await runAttestCommand(
        ['renew', '--kind', 'template', '--subject', subject],
        io,
        dependencies(),
      ),
    ).toBe(0);
    const ledger = JSON.parse(
      await readFile(join(root, '.craft/attestations.jsonl'), 'utf8'),
    );
    expect(ledger.retired).toBeUndefined();
  });

  it('rejects an unknown option instead of quietly checking something else', async () => {
    const { io, err } = await workspace();
    expect(
      await runAttestCommand(['status', '--nope'], io, dependencies()),
    ).toBe(1);
    expect(err[0]).toContain('--nope');
  });

  it('asks for a baseline before reporting what nobody is watching', async () => {
    const { io, err } = await workspace();
    const code = await runAttestCommand(['unwatched'], io, dependencies());
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('no baseline yet');
  });
});
