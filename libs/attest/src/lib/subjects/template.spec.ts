import { describe, expect, it } from 'vitest';
import type { Attestation } from '../attestation.js';
import { statusOf } from '../state.js';
import {
  observeTemplateObligations,
  templateEvidence,
  type TemplateObligationInput,
} from './template.js';

const obligation = (
  overrides: Partial<TemplateObligationInput> = {},
): TemplateObligationInput => ({
  subject: 'template:component:app.ts:Counter#render:primitive:app.ts:count',
  direction: 'render',
  component: 'component:app.ts:Counter',
  target: 'primitive:app.ts:count',
  targetKind: 'primitive',
  statement: "Counter's template renders count.",
  ...overrides,
});

describe('template subject', () => {
  it('keeps reviewer prose outside the evidence', () => {
    expect(templateEvidence(obligation({ statement: 'First wording.' }))).toBe(
      templateEvidence(obligation({ statement: 'Clearer wording.' })),
    );
  });

  it('changes evidence when the promise changes', () => {
    expect(templateEvidence(obligation())).not.toBe(
      templateEvidence(
        obligation({
          target: 'primitive:app.ts:total',
          targetKind: 'property',
        }),
      ),
    );
  });

  it('turns data into sorted template observations', () => {
    const observations = observeTemplateObligations(
      [
        obligation({ subject: 'template:z' }),
        obligation({ subject: 'template:a' }),
      ],
      (entry) => `fingerprint:${entry.target}`,
    );

    expect(observations.map((entry) => entry.subject)).toEqual([
      'template:a',
      'template:z',
    ]);
    expect(observations[0]).toMatchObject({
      kind: 'template',
      fingerprint: 'fingerprint:primitive:app.ts:count',
      assumptions: [],
    });
  });

  it('carries a promise across implementation movement and reviews a changed promise', () => {
    const command = obligation({
      subject:
        'template:component:app.ts:Counter#command:primitive:app.ts:save',
      direction: 'command',
      target: 'primitive:app.ts:save',
      element: 'button',
      elementName: 'save',
    });
    const first = observeTemplateObligations([command], () => 'code-1')[0];
    const judged: Attestation = {
      ...(first as NonNullable<typeof first>),
      verdict: 'ok',
      assumptions: [],
      by: 'romain',
      at: '2026-09-06T09:00:00.000Z',
      toolVersion: '0.8.3',
    };
    const ledger = new Map([[judged.subject, judged]]);

    const moved = observeTemplateObligations([command], () => 'code-2')[0];
    expect(statusOf(ledger, moved as NonNullable<typeof moved>).state).toBe(
      'renewed',
    );

    const changed = observeTemplateObligations(
      [{ ...command, elementName: 'save-toolbar' }],
      () => 'code-2',
    )[0];
    const status = statusOf(ledger, changed as NonNullable<typeof changed>);
    expect(status.state).toBe('review');
    expect(status.reason).toBe('the output changed');
  });
});
