import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
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

  it('treats an empty review config as a successful no-op', async () => {
    const { root, io, out, err } = await workspace();
    await writeFile(
      join(root, 'review-attest.config.ts'),
      `export const reviewAttestConfig = {};
`,
      'utf8',
    );
    const code = await runAttestCommand(
      ['status', '--config', 'review-attest.config.ts', '--kind', 'all'],
      io,
      dependencies(),
    );
    expect(code, [...out, ...err].join('\n')).toBe(0);
    expect(out[0]).toContain('missing 0');
  });

  it('excludes template obligations when template is false', async () => {
    const { root, io, out, err } = await workspace();
    await writeFile(
      join(root, 'review-attest.config.ts'),
      `export default { template: false };
`,
      'utf8',
    );
    const code = await runAttestCommand(
      ['status', '--config', 'review-attest.config.ts', '--kind', 'template'],
      io,
      dependencies(),
    );
    expect(code, [...out, ...err].join('\n')).toBe(0);
    expect(out[0]).toContain('missing 0');
  });

  it('fails clearly when the config cannot be loaded', async () => {
    const { root, io, err } = await workspace();
    await writeFile(
      join(root, 'review-attest.config.ts'),
      `export default { template: 'yes' };
`,
      'utf8',
    );
    const code = await runAttestCommand(
      ['status', '--config', 'review-attest.config.ts', '--kind', 'all'],
      io,
      dependencies(),
    );
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('template must be a boolean');
  });

  it('lists eslint-disable directives, and re-asks only when the bypass changes', async () => {
    const { root, io, out } = await workspace();
    const card = (prefix: string, reason: string) =>
      `${prefix}// eslint-disable-next-line craft-ts/no-raw-class -- ${reason}\ndiv({ class: 'prose' }, html);\n`;
    await writeFile(join(root, 'article.ts'), card('', 'markdown output'));

    expect(
      await runAttestCommand(
        ['status', '--kind', 'eslint-disable'],
        io,
        dependencies(),
      ),
    ).toBe(1);
    expect(out.join('\n')).toContain(
      'missing  eslint-disable:article.ts:craft-ts/no-raw-class:1',
    );

    await runAttestCommand(
      ['renew', '--all', '--kind', 'eslint-disable'],
      io,
      dependencies(),
    );
    // Code added above the directive: same subject, same evidence.
    await writeFile(
      join(root, 'article.ts'),
      card("import { a } from 'a';\n\n", 'markdown output'),
    );
    out.length = 0;
    expect(
      await runAttestCommand(
        ['status', '--kind', 'eslint-disable'],
        io,
        dependencies(),
      ),
    ).toBe(0);
    expect(out[0]).toBe('current 1  renewed 0  review 0  missing 0');

    // A new reason is a new decision.
    await writeFile(join(root, 'article.ts'), card('', 'vendor widget'));
    out.length = 0;
    expect(
      await runAttestCommand(
        ['status', '--kind', 'eslint-disable'],
        io,
        dependencies(),
      ),
    ).toBe(1);
    expect(out[0]).toBe('current 0  renewed 0  review 1  missing 0');
  });

  it('lists the architecture waivers every project declares', async () => {
    const { root, io, out } = await workspace();
    await mkdir(join(root, 'apps/shop/architecture'), { recursive: true });
    await writeFile(
      join(root, 'apps/shop/architecture/waivers.ts'),
      `export const list = defineArchitectureWaivers(catalog, [
  { rule: 'style-only-design-system', target: 'Markdown', reason: 'Rendered markdown.' },
]);
`,
    );
    expect(
      await runAttestCommand(
        ['status', '--kind', 'architecture-waiver'],
        io,
        dependencies(),
      ),
    ).toBe(1);
    expect(out.join('\n')).toContain(
      'missing  architecture-waiver:apps/shop:style-only-design-system:Markdown',
    );
  });

  it('refuses a bypass kind when the config turned bypasses off', async () => {
    const { root, io, err } = await workspace();
    await writeFile(
      join(root, 'review-attest.config.ts'),
      'export default { bypasses: false };\n',
    );
    expect(
      await runAttestCommand(
        ['status', '--kind', 'eslint-disable'],
        io,
        dependencies(),
      ),
    ).toBe(1);
    expect(err.join('\n')).toContain('bypasses: false');
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

it('requires all configured application captures and observes changed image bytes against a fixed human reference', async () => {
  const { defineVisualAppConfig, visualAppCaptureTargets } = await import(
    '@craft-ts/style-testing/review-attest'
  );
  const { visualAppProvenance, hashBytes } = await import(
    '@craft-ts/style-testing/visual-app/server'
  );
  const { PNG } = await import('pngjs');
  const w = await workspace();
  await writeFile(join(w.root, 'home.ts'), 'export const Home = {};');
  await writeFile(join(w.root, 'home.mocks.ts'), 'export const fixtures = [];');
  await writeFile(
    join(w.root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { moduleResolution: 'bundler' },
      files: ['home.ts', 'home.mocks.ts'],
    }),
  );
  const config = defineVisualAppConfig({
    viewports: {
      small: { width: 30, height: 30 },
      big: { width: 60, height: 60 },
    },
    pages: [
      {
        id: 'home',
        url: '/',
        route: '/',
        component: 'component:home.ts:Home',
        scenarios: [
          {
            id: 'list',
            label: 'List',
            category: 'happy-path',
            mocks: { sources: ['home.mocks.ts'], endpoints: [] },
            steps: [
              {
                action: 'capture',
                id: 'page',
                expect: [{ kind: 'url', url: '/' }],
              },
            ],
          },
        ],
      },
    ],
  });
  await writeFile(
    join(w.root, 'review-attest.config.ts'),
    `export default ${JSON.stringify({ visual: { app: config }, template: false })};`,
  );
  const targets = visualAppCaptureTargets(config);
  const image = new PNG({ width: 30, height: 30 });
  image.data.fill(255);
  const bytes = PNG.sync.write(image);
  await writeFile(join(w.root, 'image.png'), bytes);
  const captures = await Promise.all(
    targets.map(async (target) => ({
      component: target.page.component,
      scenario: target.id,
      evidenceMode: 'screenshot',
      digest: visualRun().captures[0]!.digest,
      image: 'image.png',
      metadata: { viewport: target.viewport },
      application: {
        page: 'home',
        scenario: 'list',
        label: 'List',
        category: 'happy-path',
        capture: 'page',
        viewport: target.viewportName,
        imageHash: hashBytes(bytes),
        provenance: await visualAppProvenance(config, target, w.root),
        comparison: config.comparison,
        environment: 'chromium-v1|browser|test',
        execution: { status: 'passed', mocks: [] },
      },
    })),
  );
  const report = { format: 'craft-ts-visual-report', version: 2, captures };
  const args = ['--report', 'report.json', '--kind', 'visual', '--json'];
  await writeFile(
    join(w.root, 'report.json'),
    JSON.stringify({ ...report, captures: captures.slice(0, 1) }),
  );
  expect(
    await runAttestCommand(['status', ...args], w.io, dependencies()),
  ).toBe(1);
  let status = JSON.parse(w.out.at(-1)!);
  expect(status.counts.missing).toBe(2);
  expect(
    status.statuses.some((s: { reason: string }) =>
      s.reason.includes('absent'),
    ),
  ).toBe(true);
  await writeFile(join(w.root, 'report.json'), JSON.stringify(report));
  expect(
    await runAttestCommand(['renew', ...args, '--all'], w.io, dependencies()),
  ).toBe(0);
  expect(
    await runAttestCommand(['status', ...args], w.io, dependencies()),
  ).toBe(0);
  for (let i = 0; i < 8; i++) image.data.fill(0, i * 4, i * 4 + 3);
  await writeFile(join(w.root, 'image.png'), PNG.sync.write(image));
  expect(
    await runAttestCommand(['status', ...args], w.io, dependencies()),
  ).toBe(0);
  status = JSON.parse(w.out.at(-1)!);
  expect(status.counts.renewed).toBe(2);
  for (let i = 8; i < 16; i++) image.data.fill(0, i * 4, i * 4 + 3);
  await writeFile(join(w.root, 'image.png'), PNG.sync.write(image));
  expect(
    await runAttestCommand(['status', ...args], w.io, dependencies()),
  ).toBe(1);
  expect(JSON.parse(w.out.at(-1)!).counts.review).toBe(2);
  await writeFile(
    join(w.root, 'home.mocks.ts'),
    'export const fixtures = [42];',
  );
  expect(
    await runAttestCommand(['status', ...args], w.io, dependencies()),
  ).toBe(1);
  expect(
    JSON.parse(w.out.at(-1)!).statuses.every(
      (s: { observation: { unavailable?: string } }) =>
        !!s.observation.unavailable,
    ),
  ).toBe(true);
});
