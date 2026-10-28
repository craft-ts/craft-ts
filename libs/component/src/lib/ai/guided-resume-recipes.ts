import {
  applyCraftPageActions,
  ɵinjectCraftMethodReplayRegistry,
  ɵinjectCraftPrimitiveRegistry,
  type CraftPageAction,
} from '@craft-ts/core';
import type { DebugSnapshotRestoreOptions } from './debug-session-snapshot-launch';
import { captureLiveSnapshot } from './guided-resume-checkpoints';
import {
  handOff,
  handoffConditionHolds,
  type HandoffCondition,
} from './guided-resume-handoff';
import {
  resolveGuidedResumeServerFunctionMock,
  type GuidedResumeNetwork,
} from './guided-resume-network';

export const CRAFT_RESUME_RECIPE_QUERY_PARAM = 'craft-resume-recipe';
const RUN_STATE_PREFIX = 'craft-ts.guided-resume.recipe-run.';
const STEP_TIMEOUT_MS = 15_000;
const DEFAULT_HANDOFF_TIMEOUT_MS = 5 * 60_000;
const MAX_HANDOFF_TIMEOUT_MS = 15 * 60_000;
const MAX_STEP_TIMEOUT_MS = 120_000;

type RecipeStep = Readonly<Record<string, unknown>> &
  Readonly<{ type: string }>;
type Recipe = Readonly<{
  id: string;
  sessionId: string;
  beforeSequence?: number;
  origin: string;
  objective: Readonly<{
    goal: string;
    exact: readonly string[];
    approximate: readonly string[];
    mayWrite: boolean;
  }>;
  strategy: 'autonomous' | 'existing';
  network?: GuidedResumeNetwork;
  steps: readonly RecipeStep[];
  cleanup: readonly RecipeCall[];
}>;
type RecipeCall = Readonly<Record<string, unknown>> &
  Readonly<{ address: string; args?: readonly unknown[] }>;
type RecipeRuntime = Readonly<{
  logServerUrl: string;
  registry: ReturnType<typeof ɵinjectCraftPrimitiveRegistry>;
  methods: ReturnType<typeof ɵinjectCraftMethodReplayRegistry>;
  navigate: (url: string) => Promise<unknown>;
  checkpoint: DebugSnapshotRestoreOptions;
  setNetwork?: (
    network: GuidedResumeNetwork | undefined,
    choices: Readonly<Record<string, string>>,
  ) => void;
}>;
type RunContext = {
  runId: string;
  nextStep: number;
  variables: Record<string, unknown>;
  created: Record<string, unknown>;
  cleanup: RecipeCall[];
  deviations: string[];
  mockChoices: Record<string, string>;
};

/** Execute one or all steps of a stored recipe without involving a model. */
export async function runResumeRecipe(
  params: Readonly<Record<string, unknown>>,
  runtime: RecipeRuntime,
): Promise<unknown> {
  const recipeId = params['id'];
  if (typeof recipeId !== 'string' || !recipeId)
    throw new Error('id is required.');
  const recipe = await fetchRecipe(runtime.logServerUrl, recipeId);
  if (recipe.origin !== location.origin)
    throw new Error(
      `Recipe belongs to ${recipe.origin}, but this tab is ${location.origin}.`,
    );
  const supervised = params['supervised'] === true;
  const existingRunId =
    typeof params['runId'] === 'string' ? params['runId'] : undefined;
  let context = existingRunId ? readRunState(existingRunId) : undefined;
  if (existingRunId && !context)
    throw new Error(`Recipe run ${existingRunId} cannot resume in this tab.`);
  const requestedChoices = readMockChoices(params['mockChoices']);
  if (context) {
    context.mockChoices = resolveNetworkChoices(
      recipe.network,
      requestedChoices,
      context.mockChoices,
    );
  } else {
    const mockChoices = resolveNetworkChoices(
      recipe.network,
      requestedChoices,
    );
    const response = await fetch(
      `${runtime.logServerUrl}/sessions/recipes/${encodeURIComponent(recipeId)}/runs`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supervised }),
      },
    );
    const body = (await response.json()) as {
      run?: { id?: unknown };
      error?: unknown;
    };
    if (!response.ok || typeof body.run?.id !== 'string')
      throw new Error(
        String(
          body.error ?? `Could not start recipe run (HTTP ${response.status}).`,
        ),
      );
    context = {
      runId: body.run.id,
      nextStep: 0,
      variables: { run: body.run.id },
      created: {},
      cleanup: [],
      deviations: [],
      mockChoices,
    };
    writeRunState(context);
    await announce(
      runtime.logServerUrl,
      recipe.sessionId,
      `Recette démarrée : ${recipe.objective.goal}.`,
    );
  }
  if (!context) throw new Error('Recipe run context could not be created.');
  const networkMode = recipeNetworkModeAt(recipe, context.nextStep);
  runtime.setNetwork?.(
    networkMode === 'mocked' ? recipe.network : undefined,
    networkMode === 'mocked' ? context.mockChoices : {},
  );
  await updateRun(runtime.logServerUrl, recipe.id, context.runId, {
    status: 'running',
    currentStep: context.nextStep,
    events: [
      { at: new Date().toISOString(), kind: 'resumed', step: context.nextStep },
    ],
  });

  try {
    for (let index = context.nextStep; index < recipe.steps.length; index++) {
      const step = recipe.steps[index];
      if (!step) continue;
      await executeStep(step, index, recipe, context, runtime);
      context.nextStep = index + 1;
      writeRunState(context);
      await updateRun(runtime.logServerUrl, recipe.id, context.runId, {
        status: supervised ? 'waiting-ai' : 'running',
        currentStep: index,
        events: [
          {
            at: new Date().toISOString(),
            kind: 'step-complete',
            step: index,
            detail: step.type,
          },
        ],
      });
      await announce(
        runtime.logServerUrl,
        recipe.sessionId,
        `Recette : étape ${index + 1}/${recipe.steps.length} terminée (${step.type}).`,
      );
      if (supervised)
        return {
          runId: context.runId,
          supervised: true,
          completedStep: index,
          nextStep: index + 1,
          variables: context.variables,
          deviations: context.deviations,
        };
    }
    await updateRun(runtime.logServerUrl, recipe.id, context.runId, {
      status: 'completed',
      currentStep: Math.max(0, recipe.steps.length - 1),
      events: [{ at: new Date().toISOString(), kind: 'completed' }],
    });
    await announce(
      runtime.logServerUrl,
      recipe.sessionId,
      `Recette terminée : ${recipe.objective.goal}.`,
    );
    clearRunState(context.runId);
    return {
      runId: context.runId,
      status: 'completed',
      deviations: context.deviations,
    };
  } catch (error) {
    const failedAt = context.nextStep;
    const message = error instanceof Error ? error.message : String(error);
    const cleaned = await cleanupRun(recipe, context, runtime);
    await updateRun(runtime.logServerUrl, recipe.id, context.runId, {
      status: 'failed',
      currentStep: failedAt,
      events: [
        {
          at: new Date().toISOString(),
          kind: 'failed',
          step: failedAt,
          detail: message,
        },
        ...cleaned.map((item, index) => ({
          at: new Date().toISOString(),
          kind: item.ok ? 'cleanup-complete' : 'cleanup-failed',
          step: failedAt,
          detail: `${index}: ${item.detail}`,
        })),
      ],
    });
    await announce(
      runtime.logServerUrl,
      recipe.sessionId,
      `Recette arrêtée à l’étape ${failedAt + 1} : ${message}. Les créations ont été nettoyées ; l’IA doit réparer cette recette.`,
    );
    context.nextStep = failedAt;
    context.created = {};
    context.cleanup = [];
    writeRunState(context);
    return {
      runId: context.runId,
      status: 'failed',
      failedStep: failedAt,
      error: message,
      cleanup: cleaned,
      repairRequired: true,
    };
  }
}

/** Activate a saved recipe's network mode after restoring its linked checkpoint. */
export async function configureResumeRecipeNetwork(
  params: Readonly<Record<string, unknown>>,
  runtime: RecipeRuntime,
): Promise<unknown> {
  const recipeId = params['id'];
  if (typeof recipeId !== 'string' || !recipeId)
    throw new Error('id is required.');
  const recipe = await fetchRecipe(runtime.logServerUrl, recipeId);
  if (recipe.origin !== location.origin)
    throw new Error(
      `Recipe belongs to ${recipe.origin}, but this tab is ${location.origin}.`,
    );
  const choices = resolveNetworkChoices(
    recipe.network,
    readMockChoices(params['mockChoices']),
  );
  runtime.setNetwork?.(recipe.network, choices);
  return {
    active: recipe.network?.mode === 'mocked',
    mode: recipe.network?.mode ?? 'functional',
    choices,
    next: 'The selected network mode remains active in this tab until another recipe network mode is activated or the tab reloads.',
  };
}

/** Make a supervised/failed run resume from the repaired step boundary. */
export function repairResumeRecipeRun(
  params: Readonly<Record<string, unknown>>,
): unknown {
  const runId = params['runId'];
  const fromStep = params['fromStep'];
  if (
    typeof runId !== 'string' ||
    !Number.isInteger(fromStep) ||
    (fromStep as number) < 0
  )
    return {
      updated: false,
      reason: 'runId and a non-negative fromStep are required.',
    };
  const context = readRunState(runId);
  if (!context)
    return { updated: false, reason: 'No resumable run state is in this tab.' };
  context.nextStep = fromStep as number;
  writeRunState(context);
  return { updated: true, runId, nextStep: context.nextStep };
}

async function executeStep(
  step: RecipeStep,
  index: number,
  recipe: Recipe,
  context: RunContext,
  runtime: RecipeRuntime,
): Promise<void> {
  const timeoutMs = Math.min(
    positiveNumber(step['timeoutMs']) ??
      (step.type === 'handoff' ? DEFAULT_HANDOFF_TIMEOUT_MS : STEP_TIMEOUT_MS),
    step.type === 'handoff' ? MAX_HANDOFF_TIMEOUT_MS : MAX_STEP_TIMEOUT_MS,
  );
  switch (step.type) {
    case 'handoff': {
      const until = resolveValue(step['until'], context, runtime) as
        | HandoffCondition
        | undefined;
      const reuseMs = positiveNumber(step['reuseMs']);
      if (
        until &&
        reuseMs &&
        handoffConditionHolds(until, runtime.registry, route()) &&
        reusableHandoff(until, reuseMs)
      )
        return;
      await updateRun(runtime.logServerUrl, recipe.id, context.runId, {
        status: 'waiting-human',
        currentStep: index,
        events: [
          { at: new Date().toISOString(), kind: 'waiting-human', step: index },
        ],
      });
      await announce(
        runtime.logServerUrl,
        recipe.sessionId,
        String(
          resolveValue(step['message'], context, runtime) ??
            'À vous : poursuivez dans cet onglet.',
        ),
      );
      const result = await handOff(
        {
          message: String(
            resolveValue(step['message'], context, runtime) ??
              'À vous : poursuivez dans cet onglet.',
          ),
          ...(typeof step['field'] === 'string'
            ? { field: step['field'] }
            : {}),
          ...(until ? { until } : {}),
          timeoutMs,
        },
        runtime.registry,
      );
      if (result.outcome === 'declined' || result.outcome === 'timeout')
        throw new Error(`Étape humaine ${result.outcome}.`);
      if (until && reuseMs) rememberHandoff(until, reuseMs);
      return;
    }
    case 'create': {
      requireWritePermission(recipe, 'create');
      const result =
        step['serverFunction'] !== false
          ? await invokeServerFunction(step, context, runtime, timeoutMs)
          : await invokeCall(step, context, runtime, timeoutMs);
      const as = typeof step['as'] === 'string' ? step['as'] : undefined;
      const input = resolveValue(
        step['input'] ??
          (Array.isArray(step['args']) ? step['args'][0] : undefined),
        context,
        runtime,
      );
      const entityInput =
        isRecord(input) && isRecord(input['product'])
          ? input['product']
          : input;
      if (as)
        setPath(
          context.created,
          as,
          typeof step['resultPath'] === 'string'
            ? readPath(result, step['resultPath'])
            : (entityInput ?? result),
        );
      const cleanup = isRecord(step['cleanup'])
        ? (resolveValue(step['cleanup'], context, runtime) as RecipeCall)
        : undefined;
      if (cleanup) context.cleanup.unshift(cleanup);
      if (step['waitFor'])
        await waitFor(step['waitFor'], context, runtime, timeoutMs);
      return;
    }
    case 'ensure': {
      const condition = step['condition'];
      if (conditionHolds(condition, context, runtime)) return;
      const remedies = normalizeRemedy(step['remedy']);
      if (remedies.length) {
        requireWritePermission(recipe, 'remedy');
        for (const remedy of remedies)
          await executeStep(
            remedy as RecipeStep,
            index,
            recipe,
            context,
            runtime,
          );
        await waitFor(condition, context, runtime, timeoutMs);
        await recordRemedy(index, remedies, recipe, context, runtime);
        return;
      }
      throw new Error(
        `Précondition non satisfaite : ${describeCondition(condition)}.`,
      );
    }
    case 'goto': {
      const target = resolveValue(step['route'], context, runtime);
      if (typeof target !== 'string')
        throw new Error('goto.route must be a path.');
      await runtime.navigate(target);
      await waitFor({ route: target }, context, runtime, timeoutMs);
      return;
    }
    case 'invoke': {
      const result = await invokeCall(step, context, runtime, timeoutMs);
      if (typeof step['as'] === 'string')
        setPath(context.variables, step['as'] as string, result);
      if (step['waitFor'])
        await waitFor(step['waitFor'], context, runtime, timeoutMs);
      return;
    }
    case 'act': {
      requireWritePermission(recipe, 'act');
      const action = resolveValue(
        step['action'] ?? step,
        context,
        runtime,
      ) as CraftPageAction;
      await waitForPageAction(action, runtime.navigate, timeoutMs);
      if (step['waitFor'])
        await waitFor(step['waitFor'], context, runtime, timeoutMs);
      return;
    }
    case 'expect': {
      const condition = step['condition'];
      try {
        await waitFor(condition, context, runtime, timeoutMs);
        return;
      } catch {
        /* Remedy or the declared essential/accessory outcome follows. */
      }
      const remedies = normalizeRemedy(step['remedy']);
      if (remedies.length) {
        requireWritePermission(recipe, 'remedy');
        for (const remedy of remedies)
          await executeStep(
            remedy as RecipeStep,
            index,
            recipe,
            context,
            runtime,
          );
        await waitFor(condition, context, runtime, timeoutMs);
        await recordRemedy(index, remedies, recipe, context, runtime);
        return;
      }
      if (step['level'] === 'accessory') {
        context.deviations.push(
          `Étape ${index + 1}: ${describeCondition(condition)}`,
        );
        return;
      }
      const observation =
        observedValue(condition, context, runtime) === undefined
          ? 'absente'
          : 'présente';
      throw new Error(
        `Attente essentielle violée : ${describeCondition(condition)}; une valeur était ${observation}.`,
      );
    }
    case 'checkpoint':
      await saveRecipeCheckpoint(recipe, context, runtime, step);
      return;
    case 'network': {
      const mode = step['mode'];
      if (mode !== 'functional' && mode !== 'mocked')
        throw new Error('network.mode must be functional or mocked.');
      if (mode === 'mocked' && recipe.network?.mode !== 'mocked')
        throw new Error(
          'A mocked network step needs a mocked recipe network profile.',
        );
      runtime.setNetwork?.(
        mode === 'mocked' ? recipe.network : undefined,
        mode === 'mocked' ? context.mockChoices : {},
      );
      return;
    }
    default:
      throw new Error(`Type d’étape inconnu : ${step.type}.`);
  }
}

async function recordRemedy(
  index: number,
  remedies: readonly Record<string, unknown>[],
  recipe: Recipe,
  context: RunContext,
  runtime: RecipeRuntime,
): Promise<void> {
  const detail = `Étape ${index + 1} : remède ${remedies.map((remedy) => String(remedy['type'] ?? 'inconnu')).join(' puis ')} appliqué.`;
  await updateRun(runtime.logServerUrl, recipe.id, context.runId, {
    status: 'running',
    currentStep: index,
    events: [
      {
        at: new Date().toISOString(),
        kind: 'remedy-applied',
        step: index,
        detail,
      },
    ],
  });
  await announce(runtime.logServerUrl, recipe.sessionId, detail);
}

function normalizeRemedy(value: unknown): readonly Record<string, unknown>[] {
  if (isRecord(value)) return [value];
  return Array.isArray(value) && value.every(isRecord) ? value : [];
}

function recipeNetworkModeAt(
  recipe: Recipe,
  completedSteps: number,
): 'functional' | 'mocked' {
  const hasNetworkStep = recipe.steps.some((step) => step.type === 'network');
  let mode: 'functional' | 'mocked' = hasNetworkStep
    ? 'functional'
    : (recipe.network?.mode ?? 'functional');
  for (let index = 0; index < Math.min(completedSteps, recipe.steps.length); index++) {
    const step = recipe.steps[index];
    if (
      step?.type === 'network' &&
      (step['mode'] === 'functional' || step['mode'] === 'mocked')
    )
      mode = step['mode'];
  }
  return mode;
}

async function waitForPageAction(
  action: CraftPageAction,
  navigate: RecipeRuntime['navigate'],
  timeoutMs: number,
): Promise<void> {
  const started = Date.now();
  while (true) {
    const result = await applyCraftPageActions(document, [action], navigate);
    if (!result.error) return;
    // A route can be ready before its async query has rendered named controls.
    // Retry only this transient case; ambiguity and validation errors are final.
    if (
      !result.error.includes('is not available') ||
      Date.now() - started >= timeoutMs
    )
      throw new Error(result.error);
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
}

async function invokeCall(
  step: Readonly<Record<string, unknown>>,
  context: RunContext,
  runtime: RecipeRuntime,
  timeoutMs = STEP_TIMEOUT_MS,
): Promise<unknown> {
  const address = resolveValue(step['address'], context, runtime);
  if (typeof address !== 'string' || !address)
    throw new Error('Step address is required.');
  const args = resolveValue(step['args'] ?? [], context, runtime);
  if (!Array.isArray(args)) throw new Error('Step args must be an array.');
  return await withTimeout(
    Promise.resolve(runtime.methods.invoke(address, undefined, args)),
    timeoutMs,
    address,
  );
}

async function invokeServerFunction(
  step: Readonly<Record<string, unknown>>,
  context: RunContext,
  runtime: RecipeRuntime,
  timeoutMs: number,
): Promise<unknown> {
  const address = resolveValue(
    step['address'] ?? step['function'],
    context,
    runtime,
  );
  if (typeof address !== 'string' || !address)
    throw new Error('create.address must name a server function.');
  const input = resolveValue(
    step['input'] ??
      (Array.isArray(step['args']) ? step['args'][0] : undefined),
    context,
    runtime,
  );
  const endpoint = resolveValue(
    step['endpoint'] ?? '/__server-functions',
    context,
    runtime,
  );
  if (typeof endpoint !== 'string')
    throw new Error('Server-function endpoint must be a path.');
  const url = new URL(endpoint, location.origin);
  if (url.origin !== location.origin)
    throw new Error(
      'Recipe server-function calls must stay on the app origin.',
    );
  const mock = resolveGuidedResumeServerFunctionMock(address, input);
  if (mock.active) {
    if ('error' in mock) throw mock.error;
    return mock.value;
  }
  const response = await withTimeout(
    fetch(url.href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: address, input }),
    }),
    timeoutMs,
    address,
  );
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `Server function ${address} returned HTTP ${response.status}: ${text.slice(0, 400)}.`,
    );
  return decodeServerFunctionAnswer(text);
}

function decodeServerFunctionAnswer(text: string): unknown {
  let value: unknown = text;
  for (let depth = 0; depth < 3 && typeof value === 'string'; depth++) {
    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
  }
  if (isRecord(value) && typeof value['__craftException'] === 'string')
    throw new Error(`Server function failed: ${value['__craftException']}`);
  return value;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Step ${label} timed out after ${timeoutMs} ms.`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function waitFor(
  condition: unknown,
  context: RunContext,
  runtime: RecipeRuntime,
  timeoutMs: number,
): Promise<void> {
  const started = Date.now();
  while (!conditionHolds(condition, context, runtime)) {
    if (Date.now() - started >= timeoutMs)
      throw new Error(
        `Condition timed out after ${timeoutMs} ms: ${describeCondition(condition)}.`,
      );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
}

function conditionHolds(
  raw: unknown,
  context: RunContext,
  runtime: RecipeRuntime,
): boolean {
  if (!isRecord(raw)) return false;
  const condition = resolveValue(raw, context, runtime);
  if (!isRecord(condition)) return false;
  if (typeof condition['route'] === 'string')
    return route().startsWith(condition['route']);
  if (typeof condition['address'] === 'string')
    return handoffConditionHolds(
      condition as HandoffCondition,
      runtime.registry,
      route(),
    );
  if (
    condition['response'] !== undefined &&
    typeof condition['path'] === 'string'
  ) {
    const value = readPath(
      readPath(context.variables, String(condition['response'])),
      condition['path'],
    );
    return compareCondition(value, condition);
  }
  return false;
}

function observedValue(
  raw: unknown,
  context: RunContext,
  runtime: RecipeRuntime,
): unknown {
  if (!isRecord(raw)) return undefined;
  const condition = resolveValue(raw, context, runtime);
  if (!isRecord(condition)) return undefined;
  if (typeof condition['address'] === 'string') {
    const wanted = ordinalFree(condition['address']);
    const entry = Object.entries(runtime.registry.capture()).find(
      ([address]) => ordinalFree(address) === wanted,
    );
    return entry
      ? readPath(
          entry[1],
          typeof condition['path'] === 'string' ? condition['path'] : '',
        )
      : undefined;
  }
  if (
    typeof condition['response'] === 'string' &&
    typeof condition['path'] === 'string'
  )
    return readPath(
      readPath(context.variables, condition['response']),
      condition['path'],
    );
  return undefined;
}

function compareCondition(
  value: unknown,
  condition: Record<string, unknown>,
): boolean {
  if (condition['exists'] !== undefined)
    return condition['exists']
      ? value !== undefined && value !== null
      : value == null;
  if (Object.hasOwn(condition, 'equals'))
    return sameJson(value, condition['equals']);
  if (Object.hasOwn(condition, 'notEquals'))
    return value !== undefined && !sameJson(value, condition['notEquals']);
  if (typeof condition['matches'] === 'string')
    return (
      value !== undefined &&
      new RegExp(condition['matches']).test(String(value))
    );
  return value !== undefined && value !== null;
}

function resolveValue(
  value: unknown,
  context: RunContext,
  runtime: RecipeRuntime,
): unknown {
  if (typeof value === 'string') {
    const exact = /^\{\{([^{}]+)\}\}$/.exec(value);
    if (exact?.[1]) return resolveReference(exact[1], context, runtime);
    return value.replace(/\{\{([^{}]+)\}\}/g, (_whole, reference: string) =>
      String(resolveReference(reference, context, runtime) ?? ''),
    );
  }
  if (Array.isArray(value))
    return value.map((item) => resolveValue(item, context, runtime));
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveValue(item, context, runtime),
      ]),
    );
  return value;
}

function resolveReference(
  reference: string,
  context: RunContext,
  runtime: RecipeRuntime,
): unknown {
  if (reference === 'run') return context.runId;
  if (reference.startsWith('created.'))
    return readPath(context.created, reference.slice(8));
  if (reference.startsWith('state ')) {
    // Primitive addresses contain spaces (`service:auth / state:session`);
    // split at the final space so the entire address remains intact.
    const match = /^state (.+) ([^ ]+)$/.exec(reference);
    if (!match?.[1] || !match[2]) return undefined;
    const state = Object.entries(runtime.registry.capture()).find(
      ([address]) => ordinalFree(address) === ordinalFree(match[1]!),
    )?.[1];
    return readPath(state, match[2]);
  }
  return readPath(context.variables, reference);
}

async function cleanupRun(
  recipe: Recipe,
  context: RunContext,
  runtime: RecipeRuntime,
): Promise<readonly { ok: boolean; detail: string }[]> {
  // The recipe-level cleanup is canonical. Per-create cleanup declarations
  // are used when the recipe does not have a consolidated cleanup list.
  const calls = recipe.cleanup.length ? recipe.cleanup : context.cleanup;
  const results: { ok: boolean; detail: string }[] = [];
  for (const call of calls) {
    try {
      const resolved = resolveValue(call, context, runtime) as RecipeCall;
      const args = Array.isArray(resolved.args) ? resolved.args : [];
      if (
        resolved['serverFunction'] === true ||
        (resolved['serverFunction'] !== false && resolved.address.includes('.'))
      )
        await invokeServerFunction(
          {
            address: resolved.address,
            args,
            ...(resolved['input'] === undefined
              ? {}
              : { input: resolved['input'] }),
            ...(resolved['endpoint'] === undefined
              ? {}
              : { endpoint: resolved['endpoint'] }),
          },
          context,
          runtime,
          STEP_TIMEOUT_MS,
        );
      else await runtime.methods.invoke(resolved.address, undefined, args);
      results.push({ ok: true, detail: resolved.address });
    } catch (error) {
      results.push({
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

async function saveRecipeCheckpoint(
  recipe: Recipe,
  context: RunContext,
  runtime: RecipeRuntime,
  step: RecipeStep,
): Promise<void> {
  const captured = await captureLiveSnapshot(runtime.checkpoint);
  const ttlMs = positiveNumber(step['ttlMs']) ?? 60 * 60_000;
  const response = await fetch(`${runtime.logServerUrl}/sessions/checkpoints`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: recipe.sessionId,
      beforeSequence: recipe.beforeSequence,
      origin: captured.origin,
      snapshot: captured.snapshot,
      recipeId: recipe.id,
      goal: recipe.objective.goal,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      ttlReason: String(
        step['ttlReason'] ?? 'Validité définie par la recette.',
      ),
      probes: Array.isArray(step['probes'])
        ? resolveValue(step['probes'], context, runtime)
        : [],
      created: Object.entries(context.created).map(([kind, value]) => ({
        kind,
        id: isRecord(value) ? String(value['id'] ?? '') : String(value),
      })),
      deviations: context.deviations,
    }),
  });
  const body = (await response.json()) as {
    error?: unknown;
    checkpoint?: unknown;
  };
  if (!response.ok)
    throw new Error(
      String(
        body.error ??
          `Could not save recipe checkpoint (HTTP ${response.status}).`,
      ),
    );
}

async function fetchRecipe(base: string, id: string): Promise<Recipe> {
  const response = await fetch(
    `${base}/sessions/recipes/${encodeURIComponent(id)}`,
  );
  const body = (await response.json()) as { recipe?: unknown; error?: unknown };
  if (!response.ok || !isRecord(body.recipe))
    throw new Error(
      String(body.error ?? `Recipe not found (HTTP ${response.status}).`),
    );
  return body.recipe as unknown as Recipe;
}

async function updateRun(
  base: string,
  recipeId: string,
  runId: string,
  update: Readonly<Record<string, unknown>>,
): Promise<void> {
  const response = await fetch(
    `${base}/sessions/recipes/${encodeURIComponent(recipeId)}/runs/${encodeURIComponent(runId)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update),
    },
  );
  if (!response.ok)
    throw new Error(`Could not update recipe run (HTTP ${response.status}).`);
}

async function announce(
  base: string,
  sessionId: string,
  text: string,
): Promise<void> {
  try {
    const latest = await fetch(
      `${base}/sessions/resume-requests/latest?${new URLSearchParams({ sessionId })}`,
    );
    const request = (
      (await latest.json()) as { request?: { id?: unknown } | null }
    ).request;
    if (typeof request?.id !== 'string') return;
    await fetch(
      `${base}/sessions/resume-requests/${encodeURIComponent(request.id)}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: 'ai', kind: 'step', text }),
      },
    );
  } catch {
    /* Progress is best-effort; the durable run journal remains authoritative. */
  }
}

function requireWritePermission(recipe: Recipe, operation: string): void {
  if (!recipe.objective.mayWrite)
    throw new Error(
      `Recipe objective does not permit server writes; ${operation} was blocked.`,
    );
}
function reusableHandoff(condition: HandoffCondition, ttlMs: number): boolean {
  try {
    const value = sessionStorage.getItem(
      `${RUN_STATE_PREFIX}handoff:${encodeURIComponent(JSON.stringify(condition))}`,
    );
    return (
      value !== null &&
      Number(value) > Date.now() &&
      Number(value) - Date.now() <= ttlMs
    );
  } catch {
    return false;
  }
}
function rememberHandoff(condition: HandoffCondition, ttlMs: number): void {
  try {
    sessionStorage.setItem(
      `${RUN_STATE_PREFIX}handoff:${encodeURIComponent(JSON.stringify(condition))}`,
      String(Date.now() + ttlMs),
    );
  } catch {
    /* storage can be disabled */
  }
}
function readRunState(runId: string): RunContext | undefined {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`${RUN_STATE_PREFIX}${runId}`) ?? 'null',
    );
    if (
      !isRecord(value) ||
      typeof value['runId'] !== 'string' ||
      typeof value['nextStep'] !== 'number' ||
      !isRecord(value['variables']) ||
      !isRecord(value['created']) ||
      !Array.isArray(value['cleanup']) ||
      !Array.isArray(value['deviations'])
    )
      return undefined;
    const mockChoices = isRecord(value['mockChoices'])
      ? Object.fromEntries(
          Object.entries(value['mockChoices']).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};
    return { ...value, mockChoices } as unknown as RunContext;
  } catch {
    return undefined;
  }
}

function readMockChoices(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (
    !isRecord(value) ||
    Object.entries(value).some(
      ([call, caseId]) => !call.trim() || typeof caseId !== 'string' || !caseId,
    )
  )
    throw new Error('mockChoices must map Craft call ids to case ids.');
  return Object.fromEntries(
    Object.entries(value).map(([call, caseId]) => [call, caseId as string]),
  );
}

function resolveNetworkChoices(
  network: GuidedResumeNetwork | undefined,
  overrides: Readonly<Record<string, string>>,
  previous: Readonly<Record<string, string>> = {},
): Record<string, string> {
  if (network?.mode !== 'mocked') {
    if (Object.keys(overrides).length)
      throw new Error('mockChoices require a recipe in mocked network mode.');
    return {};
  }
  const byCall = new Map(network.mocks.map((mock) => [mock.call, mock]));
  const unknownCalls = Object.keys(overrides).filter((call) => !byCall.has(call));
  if (unknownCalls.length)
    throw new Error(`Unknown mocked Craft calls: ${unknownCalls.join(', ')}.`);

  const choices: Record<string, string> = {};
  for (const mock of network.mocks) {
    const requested = overrides[mock.call];
    const saved = previous[mock.call];
    const selectedId =
      requested ??
      saved ??
      mock.defaultCaseId ??
      (mock.cases.length === 1 ? mock.cases[0]?.id : undefined);
    const selected = mock.cases.find((candidate) => candidate.id === selectedId);
    if (!selected) {
      const available = mock.cases.map((candidate) => candidate.id).join(', ');
      throw new Error(
        `Choisis un jeu pour ${mock.call} avec mockChoices (ou définis defaultCaseId pour le mémoriser). Cas disponibles : ${available}.`,
      );
    }
    choices[mock.call] = selected.id;
  }
  return choices;
}
function writeRunState(context: RunContext): void {
  try {
    sessionStorage.setItem(
      `${RUN_STATE_PREFIX}${context.runId}`,
      JSON.stringify(context),
    );
  } catch {
    /* no persistence available */
  }
}
function clearRunState(runId: string): void {
  try {
    sessionStorage.removeItem(`${RUN_STATE_PREFIX}${runId}`);
  } catch {
    /* no persistence available */
  }
}
function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}
function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split('.');
  let current = target;
  for (const key of keys.slice(0, -1)) {
    if (!isRecord(current[key])) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[keys.at(-1)!] = value;
}
function sameJson(left: unknown, right: unknown): boolean {
  return (
    Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right)
  );
}
function route(): string {
  return `${location.pathname}${location.search}${location.hash}`;
}
function ordinalFree(address: string): string {
  return address
    .split(' / ')
    .map((part) => part.replace(/#\d+$/, ''))
    .join(' / ');
}
function describeCondition(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
