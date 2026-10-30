import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseResumeRecipeInput, ResumeRecipeStore } from './resume-recipes.js';

const SESSION = '00000000-0000-4000-8000-000000000001';
const recipe = {
  sessionId: SESSION,
  beforeSequence: 12,
  origin: 'http://localhost:4301',
  objective: { goal: 'Save a new product price', exact: ['draft price'], approximate: ['list order'], mayWrite: true },
  strategy: 'autonomous',
  steps: [
    { type: 'handoff', message: 'Sign in as an admin', until: { address: 'auth / state:session', path: 'user.role', equals: 'admin' } },
    { type: 'invoke', address: 'adminDesk / state:productDraft / method:edit', args: [{ price: '4.83' }] },
    { type: 'expect', level: 'essential', condition: { address: 'adminDesk / state:productDraft', path: 'price', equals: '4.83' } },
    { type: 'checkpoint' },
  ],
  cleanup: [{ address: 'ecommerce.product.delete', args: ['{{created.product.id}}'] }],
  revisions: [{ at: '2026-10-27T10:00:00.000Z', by: 'ai', reason: 'Initial guided resume.' }],
};

describe('resume recipes', () => {
  let directory: string;
  let store: ResumeRecipeStore;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'resume-recipes-'));
    store = new ResumeRecipeStore(directory);
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('validates and durably stores a recipe by session and event', () => {
    const parsed = parseResumeRecipeInput(recipe);
    expect(typeof parsed).not.toBe('string');
    if (typeof parsed === 'string') throw new Error(parsed);
    const saved = store.save(parsed);

    expect(saved.validation.status).toBe('validation-failed');
    expect(saved.validation.issues).toContain(
      'Ajoute une étape handoff sans condition pour le point d’observation.',
    );
    expect(store.get(saved.id)).toEqual(saved);
    expect(store.list({ sessionId: SESSION, beforeSequence: 12 })).toEqual([saved]);
    expect(store.list({ sessionId: SESSION, beforeSequence: 13 })).toEqual([]);
  });

  it('validates state transitions between named mock cases', () => {
    const parsed = parseResumeRecipeInput({
      ...recipe,
      network: {
        mode: 'mocked',
        mocks: [
          {
            call: 'ecommerce.admin.overview',
            defaultCaseId: 'ready',
            cases: [
              { id: 'ready', kind: 'success', response: 'with-donut' },
              { id: 'deleted', kind: 'success', response: 'without-donut' },
              { id: 'offline', kind: 'failure', message: 'Offline' },
            ],
          },
          {
            call: 'ecommerce.product.delete',
            defaultCaseId: 'removed',
            cases: [
              {
                id: 'removed',
                kind: 'success',
                response: 'deleted',
                nextChoices: { 'ecommerce.admin.overview': 'deleted' },
              },
              { id: 'offline', kind: 'failure', message: 'Offline' },
            ],
          },
        ],
      },
    });
    expect(typeof parsed).not.toBe('string');
    if (typeof parsed === 'string') throw new Error(parsed);
    const saved = store.save(parsed);
    expect(saved.network?.mocks[1]?.cases[0]).toMatchObject({
      id: 'removed',
      nextChoices: { 'ecommerce.admin.overview': 'deleted' },
    });
  });

  it('stores versioned application scenario references instead of copied responses', () => {
    const parsed = parseResumeRecipeInput({
      ...recipe,
      network: {
        mode: 'mocked',
        mocks: [
          {
            call: 'ecommerce.catalog',
            defaultCaseId: 'demo-catalog',
            cases: [
              {
                id: 'demo-catalog',
                kind: 'success',
                scenario: {
                  operationId: 'ecommerce.catalog',
                  scenarioId: 'catalog-with-seasonal-products',
                  catalogVersion: 'ecommerce-scenarios-1',
                },
              },
              { id: 'offline', kind: 'failure', message: 'Offline' },
            ],
          },
        ],
      },
    });
    expect(typeof parsed).not.toBe('string');
    if (typeof parsed === 'string') throw new Error(parsed);
    expect(store.save(parsed).network?.mocks[0]?.cases[0]).toMatchObject({
      scenario: {
        operationId: 'ecommerce.catalog',
        scenarioId: 'catalog-with-seasonal-products',
        catalogVersion: 'ecommerce-scenarios-1',
      },
    });
  });

  it('rejects mock transitions to unknown cases', () => {
    const parsed = parseResumeRecipeInput({
      ...recipe,
      network: {
        mode: 'mocked',
        mocks: [
          {
            call: 'ecommerce.admin.overview',
            defaultCaseId: 'ready',
            cases: [
              { id: 'ready', kind: 'success', response: 'with-donut' },
              { id: 'offline', kind: 'failure', message: 'Offline' },
            ],
          },
          {
            call: 'ecommerce.product.delete',
            defaultCaseId: 'removed',
            cases: [
              {
                id: 'removed',
                kind: 'success',
                response: 'deleted',
                nextChoices: { 'ecommerce.admin.overview': 'missing' },
              },
              { id: 'offline', kind: 'failure', message: 'Offline' },
            ],
          },
        ],
      },
    });
    expect(parsed).toBe(
      'network must be a valid functional or mocked network profile.',
    );
  });

  it('rejects credentials in recipe fields so secrets must pass through handoff', () => {
    expect(parseResumeRecipeInput({
      ...recipe,
      steps: [{ type: 'act', password: 'should-not-be-stored' }],
    })).toContain('secret or credential');
  });

  it('keeps run history separately and orders it newest first', () => {
    const parsed = parseResumeRecipeInput(recipe);
    if (typeof parsed === 'string') throw new Error(parsed);
    const saved = store.save(parsed);
    const first = store.saveRun({ recipeId: saved.id, status: 'completed', supervised: false, freshTab: false, events: [] });
    const second = store.saveRun({ recipeId: saved.id, status: 'failed', supervised: true, freshTab: false, currentStep: 2, events: [] });

    expect(store.listRuns(saved.id).map((run) => run.id)).toEqual([second.id, first.id]);
    expect(store.getRun(second.id)).toEqual(second);
  });

  it('marks only a fresh run with an essential expectation, observed handoff and empty write journal verified', () => {
    const parsed = parseResumeRecipeInput({
      ...recipe,
      objective: { ...recipe.objective, mayWrite: false },
      steps: [
        { type: 'handoff', message: 'Observe the result.' },
        { type: 'expect', level: 'essential', condition: { address: 'catalog / state:items', equals: [] } },
      ],
    });
    if (typeof parsed === 'string') throw new Error(parsed);
    const saved = store.save(parsed);
    expect(saved.validation.status).toBe('draft');
    const run = store.saveRun({
      recipeId: saved.id,
      status: 'completed',
      supervised: false,
      freshTab: true,
      events: [
        { at: new Date().toISOString(), kind: 'handoff-observed', step: 0 },
        { at: new Date().toISOString(), kind: 'step-complete', step: 1, detail: 'expect' },
        { at: new Date().toISOString(), kind: 'writes-checked', detail: '0' },
      ],
    });
    expect(store.get(saved.id)?.validation).toMatchObject({
      status: 'verified',
      issues: [],
      verifiedRunId: run.id,
    });
  });
});
