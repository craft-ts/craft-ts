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

    expect(store.get(saved.id)).toEqual(saved);
    expect(store.list({ sessionId: SESSION, beforeSequence: 12 })).toEqual([saved]);
    expect(store.list({ sessionId: SESSION, beforeSequence: 13 })).toEqual([]);
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
    const first = store.saveRun({ recipeId: saved.id, status: 'completed', supervised: false, events: [] });
    const second = store.saveRun({ recipeId: saved.id, status: 'failed', supervised: true, currentStep: 2, events: [] });

    expect(store.listRuns(saved.id).map((run) => run.id)).toEqual([second.id, first.id]);
    expect(store.getRun(second.id)).toEqual(second);
  });
});
