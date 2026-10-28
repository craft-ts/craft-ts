import { afterEach, describe, expect, it, vi } from 'vitest';
import { repairResumeRecipeRun, runResumeRecipe } from './guided-resume-recipes';

const RECIPE_ID = '00000000-0000-4000-8000-000000000011';
const RUN_ID = '00000000-0000-4000-8000-000000000012';
const SESSION_ID = '00000000-0000-4000-8000-000000000013';
const previousFetch = globalThis.fetch;

function makeRecipe(steps: readonly Record<string, unknown>[], cleanup: readonly Record<string, unknown>[] = []) {
  return {
    id: RECIPE_ID,
    sessionId: SESSION_ID,
    beforeSequence: 4,
    origin: location.origin,
    objective: { goal: 'Reopen an espresso draft', exact: ['price'], approximate: [], mayWrite: true },
    strategy: 'autonomous',
    steps,
    cleanup,
  };
}

function mockRuntime(recipe: ReturnType<typeof makeRecipe>, capture: Record<string, unknown>, serverCalls: unknown[] = []) {
  const state = { ...capture };
  globalThis.fetch = vi.fn(async (input, init) => {
    const url = new URL(String(input), location.origin);
    if (url.pathname.endsWith(`/sessions/recipes/${RECIPE_ID}`))
      return Response.json({ recipe });
    if (url.pathname.endsWith(`/sessions/recipes/${RECIPE_ID}/runs`) && init?.method === 'POST')
      return Response.json({ run: { id: RUN_ID } }, { status: 201 });
    if (url.pathname.includes(`/sessions/recipes/${RECIPE_ID}/runs/`))
      return Response.json({ run: { id: RUN_ID } });
    if (url.pathname === '/sessions/resume-requests/latest') return Response.json({ request: null });
    if (url.pathname === '/__server-functions') {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      serverCalls.push(request);
      return Response.json({ products: [{ id: (request['input'] as Record<string, unknown>)['id'] }] });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  const runtime = {
    logServerUrl: location.origin,
    registry: { capture: () => state },
    methods: { invoke: vi.fn(async (address: string, _receiver: unknown, args: readonly unknown[]) => {
      if (address.endsWith('method:edit')) {
        const draft = state['adminDesk / state:productDraft'] as Record<string, unknown>;
        Object.assign(draft, args[0]);
        return draft;
      }
      return args[0];
    }) },
    navigate: vi.fn(async (route: string) => { history.replaceState(null, '', route); }),
    checkpoint: {
      registry: { capture: () => state },
      storageRegistry: { capture: async () => [] },
    },
  };
  return { runtime: runtime as never, state, serverCalls };
}

afterEach(() => { globalThis.fetch = previousFetch; sessionStorage.clear(); history.replaceState(null, '', '/'); });

describe('guided resume recipe runner', () => {
  it('creates run-scoped data, invokes Craft methods, checks the expectation and records completion', async () => {
    const serverCalls: unknown[] = [];
    const recipe = makeRecipe([
      { type: 'create', address: 'ecommerce.product.save', input: { token: '{{state adminDesk / state:session token}}', id: 'resume-{{run}}', name: 'Espresso {{run}}' }, as: 'product' },
      { type: 'invoke', address: 'adminDesk / state:productDraft / method:edit', args: [{ price: '4.83' }] },
      { type: 'expect', level: 'essential', timeoutMs: 20, condition: { address: 'adminDesk / state:productDraft', path: 'price', equals: '4.83' } },
    ]);
    const { runtime, state } = mockRuntime(recipe, { 'adminDesk / state:productDraft': { price: '3.50' }, 'adminDesk / state:session': { token: 'live-token' } }, serverCalls);

    await expect(runResumeRecipe({ id: RECIPE_ID }, runtime)).resolves.toMatchObject({ status: 'completed', runId: RUN_ID });
    expect(serverCalls[0]).toMatchObject({ id: 'ecommerce.product.save', input: { token: 'live-token', id: `resume-${RUN_ID}`, name: `Espresso ${RUN_ID}` } });
    expect(state['adminDesk / state:productDraft']).toMatchObject({ price: '4.83' });
  });

  it('runs one step at a time in supervised mode and resumes from the saved step', async () => {
    const recipe = makeRecipe([
      { type: 'invoke', address: 'adminDesk / state:productDraft / method:edit', args: [{ price: '4.00' }] },
      { type: 'invoke', address: 'adminDesk / state:productDraft / method:edit', args: [{ price: '4.83' }] },
    ]);
    const { runtime, state } = mockRuntime(recipe, { 'adminDesk / state:productDraft': { price: '3.50' } });

    const first = await runResumeRecipe({ id: RECIPE_ID, supervised: true }, runtime) as Record<string, unknown>;
    expect(first).toMatchObject({ runId: RUN_ID, completedStep: 0, nextStep: 1 });
    await expect(runResumeRecipe({ id: RECIPE_ID, runId: RUN_ID, supervised: true }, runtime)).resolves.toMatchObject({ completedStep: 1, nextStep: 2 });
    expect(state['adminDesk / state:productDraft']).toMatchObject({ price: '4.83' });
  });

  it('cleans created data and reports the failed essential expectation for repair', async () => {
    const serverCalls: unknown[] = [];
    const recipe = makeRecipe([
      { type: 'create', address: 'ecommerce.product.save', input: { id: 'resume-{{run}}', name: 'Espresso {{run}}' }, as: 'product' },
      { type: 'expect', level: 'essential', timeoutMs: 1, condition: { address: 'adminDesk / state:productDraft', path: 'price', equals: '4.83' } },
    ], [{ address: 'ecommerce.product.delete', input: { id: '{{created.product.id}}' } }]);
    const { runtime } = mockRuntime(recipe, { 'adminDesk / state:productDraft': { price: '3.50' } }, serverCalls);

    await expect(runResumeRecipe({ id: RECIPE_ID }, runtime)).resolves.toMatchObject({ status: 'failed', failedStep: 1, repairRequired: true });
    expect(serverCalls.map((call) => (call as Record<string, unknown>)['id'])).toEqual([
      'ecommerce.product.save', 'ecommerce.product.delete',
    ]);
    expect((serverCalls[1] as Record<string, unknown>)['input']).toMatchObject({ id: 'resume-' + RUN_ID });
  });

  it('applies an expectation remedy and records accessory deviations without failing', async () => {
    const recipe = makeRecipe([
      {
        type: 'expect', level: 'essential', timeoutMs: 1,
        condition: { address: 'adminDesk / state:productDraft', path: 'price', equals: '4.83' },
        remedy: { type: 'invoke', address: 'adminDesk / state:productDraft / method:edit', args: [{ price: '4.83' }] },
      },
      { type: 'expect', level: 'accessory', timeoutMs: 1, condition: { response: 'product', path: 'sort', equals: 'name' } },
    ]);
    const { runtime, state } = mockRuntime(recipe, { 'adminDesk / state:productDraft': { price: '3.50' } });

    await expect(runResumeRecipe({ id: RECIPE_ID }, runtime)).resolves.toMatchObject({
      status: 'completed', deviations: [expect.stringContaining('sort')],
    });
    expect(state['adminDesk / state:productDraft']).toMatchObject({ price: '4.83' });
  });

  it('moves a failed run back to the repaired step boundary', async () => {
    const recipe = makeRecipe([{ type: 'invoke', address: 'adminDesk / state:productDraft / method:edit', args: [{ price: '4.00' }] }]);
    const { runtime } = mockRuntime(recipe, { 'adminDesk / state:productDraft': { price: '3.50' } });
    const run = await runResumeRecipe({ id: RECIPE_ID, supervised: true }, runtime) as { runId: string };

    expect(repairResumeRecipeRun({ runId: run.runId, fromStep: 0 })).toMatchObject({ updated: true, nextStep: 0 });
    await expect(runResumeRecipe({ id: RECIPE_ID, runId: run.runId, supervised: true }, runtime)).resolves.toMatchObject({ completedStep: 0 });
  });

  it('continues a failed run from a repaired step instead of replaying its prefix', async () => {
    const steps: Record<string, unknown>[] = [
      { type: 'expect', level: 'essential', timeoutMs: 1, condition: { address: 'adminDesk / state:productDraft', path: 'price', equals: '4.83' } },
      { type: 'invoke', address: 'adminDesk / state:productDraft / method:edit', args: [{ price: '3.50' }] },
    ];
    const recipe = makeRecipe(steps);
    const { runtime, state } = mockRuntime(recipe, { 'adminDesk / state:productDraft': { price: '3.50' } });
    const failed = await runResumeRecipe({ id: RECIPE_ID }, runtime) as { runId: string; status: string };
    expect(failed).toMatchObject({ status: 'failed', failedStep: 0 });

    steps[0] = { type: 'invoke', address: 'adminDesk / state:productDraft / method:edit', args: [{ price: '4.83' }] };
    expect(repairResumeRecipeRun({ runId: failed.runId, fromStep: 0 })).toMatchObject({ updated: true });
    await expect(runResumeRecipe({ id: RECIPE_ID, runId: failed.runId }, runtime)).resolves.toMatchObject({ status: 'completed' });
    expect(state['adminDesk / state:productDraft']).toMatchObject({ price: '3.50' });
  });
});
