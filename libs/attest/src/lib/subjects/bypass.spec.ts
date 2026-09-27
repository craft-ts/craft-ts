/**
 * The two bypass subjects: an `eslint-disable` directive and an architecture
 * waiver. What matters is which edits send them back to a person and which
 * do not.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEvidenceStore } from '../evidence-store.js';
import {
  eslintDisableExcerpt,
  loadEslintDisableEvidence,
  observeEslintDisables,
  storeEslintDisableEvidence,
  type EslintDisableInput,
} from './eslint-disable.js';
import {
  architectureWaiverSubjectId,
  loadArchitectureWaiverEvidence,
  observeArchitectureWaivers,
  storeArchitectureWaiverEvidence,
  type ArchitectureWaiverInput,
} from './architecture-waiver.js';

const directive = (
  source: string,
  overrides: Partial<EslintDisableInput> = {},
): EslintDisableInput => {
  const line =
    source.split('\n').findIndex((text) => text.includes('eslint-disable')) + 1;
  return {
    subject: 'eslint-disable:src/card.ts:craft-ts/no-raw-class:1',
    filePath: 'src/card.ts',
    line,
    highlightLine: line + 1,
    directive: 'disable-next-line',
    rule: 'craft-ts/no-raw-class',
    reason: 'markdown output carries its own classes',
    source,
    ...overrides,
  };
};

const BODY = [
  '// eslint-disable-next-line craft-ts/no-raw-class -- markdown output carries its own classes',
  "div({ class: 'prose' }, html);",
].join('\n');

describe('eslint-disable subjects', () => {
  it('keeps the same evidence when unrelated code moves the directive', () => {
    const before = observeEslintDisables([directive(`import a;\n${BODY}`)]);
    const after = observeEslintDisables([
      directive(`import a;\nimport b;\n\nfunction other() {}\n${BODY}`),
    ]);
    expect(after[0]?.evidence).toBe(before[0]?.evidence);
    expect(after[0]?.subject).toBe(before[0]?.subject);
  });

  it('changes the evidence when the reason or the silenced line changes', () => {
    const base = observeEslintDisables([directive(BODY)])[0]?.evidence;
    expect(
      observeEslintDisables([directive(BODY, { reason: 'another reason' })])[0]
        ?.evidence,
    ).not.toBe(base);
    expect(
      observeEslintDisables([
        directive(BODY.replace("'prose'", "'prose wide'")),
      ])[0]?.evidence,
    ).not.toBe(base);
  });

  it('excerpts exactly what the directive silences', () => {
    expect(eslintDisableExcerpt(directive(BODY))).toEqual(BODY.split('\n'));
    const inline =
      "div({ class: 'x' }); // eslint-disable-line craft-ts/no-raw-class";
    expect(
      eslintDisableExcerpt(
        directive(`a;\n${inline}\nb;`, { directive: 'disable-line' }),
      ),
    ).toEqual([inline]);
  });

  it('round-trips through the evidence store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-attest-bypass-'));
    try {
      const store = createEvidenceStore(root);
      const input = directive(BODY);
      const hash = await storeEslintDisableEvidence(store, input);
      expect(hash).toBe(observeEslintDisables([input])[0]?.evidence);
      expect(await loadEslintDisableEvidence(store, hash)).toMatchObject({
        rule: 'craft-ts/no-raw-class',
        reason: 'markdown output carries its own classes',
        excerpt: BODY.split('\n'),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('architecture-waiver subjects', () => {
  const waiver: ArchitectureWaiverInput = {
    project: 'apps/demo',
    rule: 'style-only-design-system',
    target: 'MarkdownArticle',
    reason: 'The HTML rendered from markdown carries its own classes.',
    filePath: 'apps/demo/architecture/waivers.ts',
    line: 12,
  };

  it('is keyed on project, rule and target, and moves with the reason only', () => {
    const [observed] = observeArchitectureWaivers([waiver]);
    expect(observed?.subject).toBe(
      'architecture-waiver:apps/demo:style-only-design-system:MarkdownArticle',
    );
    expect(observed?.kind).toBe('architecture-waiver');
    expect(
      observeArchitectureWaivers([{ ...waiver, line: 40 }])[0]?.evidence,
    ).toBe(observed?.evidence);
    expect(
      observeArchitectureWaivers([{ ...waiver, reason: 'Vendor widget.' }])[0]
        ?.evidence,
    ).not.toBe(observed?.evidence);
    expect(architectureWaiverSubjectId(waiver)).toBe(observed?.subject);
  });

  it('round-trips through the evidence store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-attest-waiver-'));
    try {
      const store = createEvidenceStore(root);
      const hash = await storeArchitectureWaiverEvidence(store, waiver);
      expect(await loadArchitectureWaiverEvidence(store, hash)).toEqual({
        project: 'apps/demo',
        rule: 'style-only-design-system',
        target: 'MarkdownArticle',
        reason: 'The HTML rendered from markdown carries its own classes.',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
