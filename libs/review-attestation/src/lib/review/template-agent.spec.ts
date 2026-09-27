// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readTemplateContext,
  runTemplateAgent,
  templatePolicyFor,
  validateTemplateAgentResults,
  type TemplateAgentDossier,
} from './template-agent.js';
import { buildTemplateReviewCard } from '@craft-ts/dev-tools/attestation-review';
import { defineReviewAttestConfig } from '../review-attest.js';

const card = buildTemplateReviewCard({
  subject: 'name',
  component: 'Profile',
  state: 'missing',
  reason: 'new',
  statement: 'displays name',
  currentEvidenceHash: 'a',
  currentEvidence: {
    direction: 'render',
    element: null,
    elementName: null,
    target: 'name',
    targetKind: 'state',
  },
  hadPreviousAttestation: false,
  currentLeaves: {},
});
const dossier: TemplateAgentDossier = {
  version: 1,
  instruction: 'Review',
  obligations: [card],
  context: [{ path: 'requirements.md', content: 'Display names' }],
  sources: [{ path: 'profile.ts', content: 'name' }],
};
const accepted = {
  id: card.id,
  outcome: 'accepted',
  rationale: 'The requirements specify displaying names.',
  references: ['requirements.md'],
};
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('template agent boundary', () => {
  it('defaults to humans and applies the last matching scoped policy', () => {
    expect(templatePolicyFor(undefined, card)).toBe('human-required');
    expect(
      templatePolicyFor(
        {
          defaultPolicy: 'agent-allowed',
          rules: [
            { component: 'Profile', policy: 'human-required' },
            { subject: 'name', policy: 'agent-allowed' },
          ],
        },
        card,
      ),
    ).toBe('agent-allowed');
    expect(
      templatePolicyFor(
        { rules: [{ direction: 'command', policy: 'agent-allowed' }] },
        card,
      ),
    ).toBe('human-required');
  });
  it('requires one justified result per obligation and product evidence for acceptance', () => {
    expect(validateTemplateAgentResults([accepted], dossier)).toEqual([
      accepted,
    ]);
    for (const value of [
      [],
      [accepted, accepted],
      [{ ...accepted, id: 'other' }],
      [{ ...accepted, rationale: '' }],
      [{ ...accepted, references: ['invented.md'] }],
      [{ ...accepted, references: ['profile.ts'] }],
    ])
      expect(() => validateTemplateAgentResults(value, dossier)).toThrow();
    expect(
      validateTemplateAgentResults(
        [{ ...accepted, outcome: 'needs-human', references: [] }],
        dossier,
      ),
    ).toHaveLength(1);
  });
  it('changes the context hash when requirements change and fails for missing context', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'template-review-'));
    dirs.push(dir);
    await writeFile(join(dir, 'requirements.md'), 'first');
    const config = { contextFiles: ['requirements.md'] };
    const before = await readTemplateContext(dir, config);
    await writeFile(join(dir, 'requirements.md'), 'second');
    expect((await readTemplateContext(dir, config)).hash).not.toBe(before.hash);
    await expect(
      readTemplateContext(dir, { contextFiles: ['missing.md'] }),
    ).rejects.toThrow();
  });
  it('runs a configured adapter with the dossier on stdin and validates stdout', async () => {
    const command: [string, ...string[]] = [
      process.execPath,
      '-e',
      `let data='';process.stdin.on('data', c=>data+=c);process.stdin.on('end',()=>{const d=JSON.parse(data);process.stdout.write(JSON.stringify(d.obligations.map(c=>({id:c.id,outcome:'accepted',rationale:'Matches requirements',references:[d.context[0].path]}))))})`,
    ];
    const results = await runTemplateAgent(
      process.cwd(),
      { name: 'test adapter', command },
      dossier,
    );
    expect(results[0]?.outcome).toBe('accepted');
    await expect(
      runTemplateAgent(
        process.cwd(),
        {
          name: 'bad adapter',
          command: [process.execPath, '-e', 'console.log("not JSON")'],
        },
        dossier,
      ),
    ).rejects.toThrow('JSON');
  });
  it('validates configuration and preserves template boolean compatibility', () => {
    expect(defineReviewAttestConfig({ template: true }).template).toBe(true);
    expect(
      defineReviewAttestConfig({
        template: true,
        templateReview: { defaultPolicy: 'agent-allowed' },
      }).templateReview?.defaultPolicy,
    ).toBe('agent-allowed');
    for (const templateReview of [
      { defaultPolicy: 'auto' },
      { agent: { name: 'a', command: [] } },
      { rules: [{ policy: 'auto' }] },
    ])
      expect(() =>
        defineReviewAttestConfig({ template: true, templateReview } as never),
      ).toThrow();
  });
});
