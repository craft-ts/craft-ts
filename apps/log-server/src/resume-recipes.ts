import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export type ResumeRecipeObjective = Readonly<{
  goal: string;
  exact: readonly string[];
  approximate: readonly string[];
  mayWrite: boolean;
}>;

/** A Craft-level step. The runner validates each step's fields before use. */
export type ResumeRecipeStep = Readonly<Record<string, unknown>> &
  Readonly<{ type: 'handoff' | 'create' | 'ensure' | 'goto' | 'invoke' | 'act' | 'expect' | 'checkpoint' | 'network' }>;

export type ResumeRecipeMockCase =
  | Readonly<{
      id: string;
      kind: 'success';
      response?: unknown;
      scenario?: Readonly<{
        operationId: string;
        scenarioId: string;
        catalogVersion: string;
      }>;
      nextChoices?: Readonly<Record<string, string>>;
    }>
  | Readonly<{
      id: string;
      kind: 'exception';
      tag: string;
      scope?: string;
      payload?: unknown;
    }>
  | Readonly<{ id: string; kind: 'failure'; message: string }>;

export type ResumeRecipeNetwork = Readonly<{
  mode: 'functional' | 'mocked';
  mocks: readonly Readonly<{
    /** Stable Craft server-function id, e.g. `ecommerce.cart.addLine`. */
    call: string;
    defaultCaseId?: string;
    cases: readonly ResumeRecipeMockCase[];
  }>[];
}>;

export type ResumeRecipeCall = Readonly<Record<string, unknown>> & Readonly<{ address: string }>;

export type ResumeRecipe = Readonly<{
  id: string;
  sessionId: string;
  beforeSequence?: number;
  origin: string;
  /** Short label for dashboard lists; older recipes may omit it. */
  name?: string;
  /** One-sentence explanation shown beside the recipe name. */
  summary?: string;
  objective: ResumeRecipeObjective;
  strategy: 'autonomous' | 'existing';
  network?: ResumeRecipeNetwork;
  steps: readonly ResumeRecipeStep[];
  cleanup: readonly ResumeRecipeCall[];
  revisions: readonly Readonly<{ at: string; by: 'ai' | 'person'; reason: string }>[];
  /** Server-owned lifecycle; callers cannot mark a recipe verified. */
  validation: Readonly<{
    status: 'draft' | 'validation-failed' | 'verified';
    issues: readonly string[];
    verifiedRunId?: string;
    updatedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}>;

export type ResumeRecipeRun = Readonly<{
  id: string;
  recipeId: string;
  startedAt: string;
  updatedAt: string;
  status: 'running' | 'waiting-human' | 'waiting-ai' | 'completed' | 'failed' | 'cancelled';
  freshTab: boolean;
  currentStep?: number;
  supervised: boolean;
  events: readonly Readonly<{ at: string; kind: string; step?: number; detail?: string }>[];
}>;

export const RECIPE_STEP_TYPES = [
  'handoff', 'create', 'ensure', 'goto', 'invoke', 'act', 'expect', 'checkpoint', 'network',
] as const;
type ResumeRecipeDraft = Omit<
  ResumeRecipe,
  'id' | 'createdAt' | 'updatedAt' | 'validation'
>;

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STEPS = 200;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const FORBIDDEN_KEY = /(?:password|passwd|secret|credential|authorization|access.?token|refresh.?token|one.?time.?code|otp)/i;

export class ResumeRecipeStore {
  readonly directory: string;
  #lastRunTimestamp = 0;

  constructor(directory: string) {
    this.directory = directory;
    mkdirSync(join(directory, 'runs'), { recursive: true });
  }

  save(value: Omit<ResumeRecipe, 'id' | 'createdAt' | 'updatedAt' | 'validation'> & Partial<Pick<ResumeRecipe, 'id'>>): ResumeRecipe {
    const now = new Date().toISOString();
    const existing = value.id ? this.get(value.id) : undefined;
    const staticIssues = recipeStaticValidationIssues(value);
    const recipe: ResumeRecipe = {
      ...value,
      id: existing?.id ?? value.id ?? randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      validation: {
        status: staticIssues.length ? 'validation-failed' : 'draft',
        issues: staticIssues,
        updatedAt: now,
      },
    };
    const invalid = validateRecipe(recipe);
    if (invalid) throw new Error(invalid);
    const path = this.#path(recipe.id);
    writeFileSync(`${path}.tmp`, JSON.stringify(recipe), 'utf8');
    renameSync(`${path}.tmp`, path);
    return recipe;
  }

  get(id: string): ResumeRecipe | undefined {
    if (!ID_PATTERN.test(id)) return undefined;
    try {
      const value = JSON.parse(readFileSync(this.#path(id), 'utf8')) as Partial<ResumeRecipe>;
      if (!value.id || !value.updatedAt) return undefined;
      return {
        ...value,
        validation: value.validation ?? {
          status: 'draft',
          issues: [],
          updatedAt: value.updatedAt,
        },
      } as ResumeRecipe;
    } catch {
      return undefined;
    }
  }

  list(filter: Readonly<{ sessionId?: string; beforeSequence?: number }> = {}): readonly ResumeRecipe[] {
    return readdirSync(this.directory)
      .filter((name) => name.endsWith('.json'))
      .flatMap((name) => {
        const recipe = this.get(name.slice(0, -5));
        if (!recipe) return [];
        if (filter.sessionId !== undefined && recipe.sessionId !== filter.sessionId) return [];
        if (filter.beforeSequence !== undefined && recipe.beforeSequence !== filter.beforeSequence) return [];
        return [recipe];
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  saveRun(input: Omit<ResumeRecipeRun, 'id' | 'startedAt' | 'updatedAt'> & Partial<Pick<ResumeRecipeRun, 'id' | 'startedAt'>>): ResumeRecipeRun {
    this.#lastRunTimestamp = Math.max(Date.now(), this.#lastRunTimestamp + 1);
    const now = new Date(this.#lastRunTimestamp).toISOString();
    const run: ResumeRecipeRun = {
      ...input,
      id: input.id ?? randomUUID(),
      startedAt: input.startedAt ?? now,
      updatedAt: now,
    };
    if (!ID_PATTERN.test(run.recipeId) || !ID_PATTERN.test(run.id)) throw new Error('Run and recipe ids must be UUIDs.');
    const recipe = this.get(run.recipeId);
    if (!recipe) throw new Error('Recipe not found.');
    const path = this.#runPath(run.id);
    writeFileSync(`${path}.tmp`, JSON.stringify(run), 'utf8');
    renameSync(`${path}.tmp`, path);
    if (run.status === 'failed') {
      this.updateValidation(run.recipeId, { status: 'validation-failed', issues: [failureDetail(run)] });
    } else if (run.status === 'completed') {
      const latest = this.get(run.recipeId);
      const issues = latest ? recipePrevalidationIssues(latest, run) : ['Recipe not found.'];
      this.updateValidation(run.recipeId, issues.length
        ? { status: 'validation-failed', issues }
        : { status: 'verified', issues: [], verifiedRunId: run.id });
    }
    return run;
  }

  updateValidation(id: string, validation: Readonly<{ status: 'draft' | 'validation-failed' | 'verified'; issues: readonly string[]; verifiedRunId?: string }>): ResumeRecipe | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    const updated: ResumeRecipe = {
      ...existing,
      updatedAt: now,
      validation: { ...validation, updatedAt: now },
    };
    const path = this.#path(id);
    writeFileSync(`${path}.tmp`, JSON.stringify(updated), 'utf8');
    renameSync(`${path}.tmp`, path);
    return updated;
  }

  getRun(id: string): ResumeRecipeRun | undefined {
    if (!ID_PATTERN.test(id)) return undefined;
    try {
      return JSON.parse(readFileSync(this.#runPath(id), 'utf8')) as ResumeRecipeRun;
    } catch {
      return undefined;
    }
  }

  listRuns(recipeId: string): readonly ResumeRecipeRun[] {
    if (!ID_PATTERN.test(recipeId)) return [];
    const directory = join(this.directory, 'runs');
    return readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .flatMap((name) => {
        try {
          const run = JSON.parse(readFileSync(join(directory, name), 'utf8')) as ResumeRecipeRun;
          return run.recipeId === recipeId ? [run] : [];
        } catch {
          return [];
        }
      })
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  get storageBytes(): number {
    const bytes = (directory: string) => readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .reduce((total, entry) => total + statSync(join(directory, entry.name)).size, 0);
    return bytes(this.directory) + bytes(join(this.directory, 'runs'));
  }

  #path(id: string): string { return join(this.directory, `${id}.json`); }
  #runPath(id: string): string { return join(this.directory, 'runs', `${id}.json`); }
}

export function parseResumeRecipeInput(value: unknown): (Omit<ResumeRecipe, 'id' | 'createdAt' | 'updatedAt' | 'validation'> & Partial<Pick<ResumeRecipe, 'id'>>) | string {
  if (!isRecord(value)) return 'A recipe is an object.';
  const { id: rawId, sessionId, beforeSequence, origin, name, summary, objective, strategy, network, steps, cleanup, revisions } = value;
  if (rawId !== undefined && (typeof rawId !== 'string' || !ID_PATTERN.test(rawId))) return 'id must be a recipe UUID.';
  if (typeof sessionId !== 'string' || !ID_PATTERN.test(sessionId)) return 'sessionId must be a session UUID.';
  if (beforeSequence !== undefined && (!Number.isInteger(beforeSequence) || (beforeSequence as number) < 0)) return 'beforeSequence must be a non-negative integer.';
  if (typeof origin !== 'string' || !/^https?:\/\/[^/]+$/.test(origin)) return 'origin must be an http(s) origin.';
  if (!isRecord(objective)) return 'objective must include goal, exact, approximate and mayWrite.';
  const objectiveGoal = objective['goal'];
  if (typeof objectiveGoal !== 'string' || !objectiveGoal.trim() || objectiveGoal.length > 500 || !isStringArray(objective['exact']) || !isStringArray(objective['approximate']) || typeof objective['mayWrite'] !== 'boolean') return 'objective must include goal, exact, approximate and mayWrite.';
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 120)) return 'name must be 1–120 characters.';
  if (summary !== undefined && (typeof summary !== 'string' || !summary.trim() || summary.length > 500)) return 'summary must be 1–500 characters.';
  if (strategy !== 'autonomous' && strategy !== 'existing') return 'strategy must be autonomous or existing.';
  if (network !== undefined && !isResumeRecipeNetwork(network)) return 'network must be a valid functional or mocked network profile.';
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > MAX_STEPS || !steps.every(isRecipeStep)) return `steps must contain 1–${MAX_STEPS} valid recipe steps.`;
  if (!Array.isArray(cleanup) || cleanup.length > MAX_STEPS || !cleanup.every(isRecipeCall)) return 'cleanup must be a list of Craft calls.';
  if (!Array.isArray(revisions) || !revisions.every(isRevision)) return 'revisions must be { at, by, reason }.';
  const candidate = {
    sessionId,
    ...(typeof beforeSequence === 'number' ? { beforeSequence } : {}),
    origin,
    name: typeof name === 'string' ? name.trim() : objectiveGoal.trim(),
    summary: typeof summary === 'string' ? summary.trim() : objectiveGoal.trim(),
    objective: objective as unknown as ResumeRecipeObjective,
    strategy: strategy as ResumeRecipe['strategy'],
    ...(network === undefined ? {} : { network: network as ResumeRecipeNetwork }),
    steps: steps as ResumeRecipeStep[],
    cleanup: cleanup as ResumeRecipeCall[],
    revisions: revisions as ResumeRecipe['revisions'],
    validation: { status: 'draft' as const, issues: [], updatedAt: '' },
  };
  const invalid = validateRecipe({
    ...candidate,
    id: typeof rawId === 'string' ? rawId : randomUUID(),
    createdAt: '',
    updatedAt: '',
  });
  if (invalid) return invalid;
  return { ...(typeof rawId === 'string' ? { id: rawId } : {}), ...candidate };
}

function validateRecipe(recipe: ResumeRecipe): string | undefined {
  const json = JSON.stringify(recipe);
  if (Buffer.byteLength(json, 'utf8') > MAX_JSON_BYTES) return 'Recipe exceeds the 2 MB limit.';
  if (containsSecretKey(recipe)) return 'Recipes cannot contain secret or credential fields; use a handoff step.';
  if (recipe.network !== undefined && !isResumeRecipeNetwork(recipe.network))
    return 'Recipe network profile is invalid.';
  if (recipe.name !== undefined && (!recipe.name.trim() || recipe.name.length > 120))
    return 'Recipe name must be 1–120 characters.';
  if (recipe.summary !== undefined && (!recipe.summary.trim() || recipe.summary.length > 500))
    return 'Recipe summary must be 1–500 characters.';
  if (
    recipe.steps.some(
      (step) =>
        step.type === 'network' &&
        step['mode'] !== 'functional' &&
        step['mode'] !== 'mocked',
    )
  )
    return 'A network step must choose functional or mocked mode.';
  if (
    recipe.steps.some(
      (step) => step.type === 'network' && step['mode'] === 'mocked',
    ) &&
    recipe.network?.mode !== 'mocked'
  )
    return 'A mocked network step requires a mocked recipe network profile.';
  return undefined;
}

/** Static checks that can be performed without loading a browser or catalog. */
export function recipeStaticValidationIssues(
  recipe: ResumeRecipeDraft | ResumeRecipe,
): string[] {
  const issues: string[] = [];
  const essential = recipe.steps.filter(
    (step) => step.type === 'expect' && step['level'] === 'essential',
  );
  if (essential.length === 0)
    issues.push('Ajoute au moins une attente essentielle vérifiable.');
  const observableHandoff = recipe.steps.some(
    (step) => step.type === 'handoff' && step['until'] === undefined,
  );
  if (!observableHandoff)
    issues.push('Ajoute une étape handoff sans condition pour le point d’observation.');
  for (const mock of recipe.network?.mocks ?? []) {
    if (
      mock.defaultCaseId !== undefined &&
      !mock.cases.some((item) => item.id === mock.defaultCaseId)
    )
      issues.push(`Le cas par défaut "${mock.defaultCaseId}" de "${mock.call}" est inconnu.`);
    if (mock.cases.some((item) => item.kind === 'success' && item.response === undefined && item.scenario === undefined))
      issues.push(`Chaque cas de succès de "${mock.call}" doit référencer une réponse ou un scénario avec codec.`);
  }
  return [...new Set(issues)];
}

function recipePrevalidationIssues(
  recipe: ResumeRecipe,
  run: ResumeRecipeRun,
): string[] {
  const issues = recipeStaticValidationIssues(recipe);
  if (!run.freshTab) issues.push('La prévalidation doit partir d’un onglet neuf lancé par le dashboard.');
  const completedSteps = new Set(
    run.events
      .filter((event) => event.kind === 'step-complete' && event.step !== undefined)
      .map((event) => event.step),
  );
  recipe.steps.forEach((step, index) => {
    if (step.type === 'expect' && step['level'] === 'essential' && !completedSteps.has(index))
      issues.push(`L’attente essentielle de l’étape ${index + 1} n’a pas été satisfaite.`);
  });
  const handoffIndex = recipe.steps.findIndex(
    (step) => step.type === 'handoff' && step['until'] === undefined,
  );
  if (handoffIndex < 0 || !run.events.some(
    (event) => event.kind === 'handoff-observed' && event.step === handoffIndex,
  )) issues.push('Le point d’observation humain n’a pas été atteint depuis l’onglet neuf.');
  if (
    !recipe.objective.mayWrite &&
    !run.events.some((event) => event.kind === 'writes-checked' && event.detail === '0')
  )
    issues.push('Le journal app.writes ne prouve pas une exécution sans écriture.');
  return [...new Set(issues)];
}

function failureDetail(run: ResumeRecipeRun): string {
  const failure = [...run.events].reverse().find((event) => event.kind === 'failed');
  return failure?.detail ?? `La recette a échoué à l’étape ${(run.currentStep ?? 0) + 1}.`;
}

function isResumeRecipeNetwork(value: unknown): value is ResumeRecipeNetwork {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== 'mode' && key !== 'mocks') ||
    !['functional', 'mocked'].includes(String(value['mode'])) ||
    !Array.isArray(value['mocks']) ||
    value['mocks'].length > 200
  )
    return false;
  const mode = value['mode'];
  const mocks = value['mocks'];
  if (mode === 'functional' && mocks.length !== 0) return false;
  if (mode === 'mocked' && mocks.length === 0) return false;
  const calls = new Set<string>();
  const casesByCall = new Map<string, Set<string>>();
  const transitions: Array<Readonly<{ call: string; caseId: string }>> = [];
  for (const mock of mocks) {
    if (
      !isRecord(mock) ||
      Object.keys(mock).some(
        (key) => !['call', 'defaultCaseId', 'cases'].includes(key),
      ) ||
      typeof mock['call'] !== 'string' ||
      !isValidMockCall(mock['call']) ||
      calls.has(mock['call']) ||
      !Array.isArray(mock['cases']) ||
      mock['cases'].length === 0 ||
      mock['cases'].length > 50 ||
      (mock['defaultCaseId'] !== undefined &&
        typeof mock['defaultCaseId'] !== 'string')
    )
      return false;
    calls.add(mock['call']);
    const caseIds = new Set<string>();
    let hasSuccess = false;
    let hasFailure = false;
    for (const candidate of mock['cases']) {
      if (
        !isRecord(candidate) ||
        typeof candidate['id'] !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(candidate['id']) ||
        caseIds.has(candidate['id'])
      )
        return false;
      caseIds.add(candidate['id']);
      if (candidate['kind'] === 'success') {
        hasSuccess = true;
        if (
          Object.keys(candidate).some(
            (key) => !['id', 'kind', 'response', 'scenario', 'nextChoices'].includes(key),
          ) ||
          (('response' in candidate) === ('scenario' in candidate)) ||
          ('response' in candidate && !isJsonValue(candidate['response'])) ||
          ('scenario' in candidate && !isRecipeScenarioReference(candidate['scenario']))
        )
          return false;
        if (candidate['nextChoices'] !== undefined) {
          const nextChoices = candidate['nextChoices'];
          if (
            !isRecord(nextChoices) ||
            Object.keys(nextChoices).length > 200 ||
            Object.entries(nextChoices).some(
              ([call, caseId]) =>
                !isValidMockCall(call) || typeof caseId !== 'string',
            )
          )
            return false;
          for (const [call, caseId] of Object.entries(nextChoices))
            transitions.push({ call, caseId: caseId as string });
        }
      } else if (candidate['kind'] === 'exception') {
        hasFailure = true;
        if (
          Object.keys(candidate).some(
            (key) => !['id', 'kind', 'tag', 'scope', 'payload'].includes(key),
          ) ||
          typeof candidate['tag'] !== 'string' ||
          !/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(candidate['tag']) ||
          (candidate['scope'] !== undefined &&
            typeof candidate['scope'] !== 'string') ||
          ('payload' in candidate && !isJsonValue(candidate['payload']))
        )
          return false;
      } else if (
        candidate['kind'] === 'failure' &&
        Object.keys(candidate).every((key) => ['id', 'kind', 'message'].includes(key)) &&
        typeof candidate['message'] === 'string' &&
        candidate['message'].trim().length > 0 &&
        candidate['message'].length <= 2_000
      ) {
        hasFailure = true;
        // Explicit transport failure case.
      } else return false;
    }
    if (mode === 'mocked' && (!hasSuccess || !hasFailure)) return false;
    if (
      mock['defaultCaseId'] !== undefined &&
      !caseIds.has(mock['defaultCaseId'] as string)
    )
      return false;
    casesByCall.set(mock['call'], caseIds);
  }
  return transitions.every(({ call, caseId }) =>
    casesByCall.get(call)?.has(caseId),
  );
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  )
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return (
    isRecord(value) &&
    Object.values(value).every(isJsonValue)
  );
}

function isRecipeScenarioReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => ['operationId', 'scenarioId', 'catalogVersion'].includes(key)) &&
    typeof value['operationId'] === 'string' &&
    /^[A-Za-z][A-Za-z0-9._:-]*$/.test(value['operationId']) &&
    typeof value['scenarioId'] === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value['scenarioId']) &&
    typeof value['catalogVersion'] === 'string' && value['catalogVersion'].length > 0
  );
}

function isValidMockCall(value: string): boolean {
  return (
    /^[A-Za-z0-9_$.-]{1,200}$/.test(value) ||
    /^[A-Z]{3,10} (?:https?:\/\/\S{1,500}|\/\S{0,500})$/.test(value)
  );
}

function containsSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) =>
    (FORBIDDEN_KEY.test(key) && !isLiveReference(nested)) || containsSecretKey(nested),
  );
}

function isLiveReference(value: unknown): boolean {
  return typeof value === 'string' && /^\{\{state .+\}\}$/.test(value);
}

function isRecipeStep(value: unknown): value is ResumeRecipeStep {
  return isRecord(value) && RECIPE_STEP_TYPES.includes(value['type'] as typeof RECIPE_STEP_TYPES[number]);
}
function isRecipeCall(value: unknown): value is ResumeRecipeCall { return isRecord(value) && typeof value['address'] === 'string' && value['address'].length > 0; }
function isRevision(value: unknown): value is ResumeRecipe['revisions'][number] { return isRecord(value) && typeof value['at'] === 'string' && (value['by'] === 'ai' || value['by'] === 'person') && typeof value['reason'] === 'string'; }
function isStringArray(value: unknown): value is readonly string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string'); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

