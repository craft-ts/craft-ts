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
  Readonly<{ type: 'handoff' | 'create' | 'ensure' | 'goto' | 'invoke' | 'act' | 'expect' | 'checkpoint' }>;

export type ResumeRecipeCall = Readonly<Record<string, unknown>> & Readonly<{ address: string }>;

export type ResumeRecipe = Readonly<{
  id: string;
  sessionId: string;
  beforeSequence?: number;
  origin: string;
  objective: ResumeRecipeObjective;
  strategy: 'autonomous' | 'existing';
  steps: readonly ResumeRecipeStep[];
  cleanup: readonly ResumeRecipeCall[];
  revisions: readonly Readonly<{ at: string; by: 'ai' | 'person'; reason: string }>[];
  createdAt: string;
  updatedAt: string;
}>;

export type ResumeRecipeRun = Readonly<{
  id: string;
  recipeId: string;
  startedAt: string;
  updatedAt: string;
  status: 'running' | 'waiting-human' | 'waiting-ai' | 'completed' | 'failed' | 'cancelled';
  currentStep?: number;
  supervised: boolean;
  events: readonly Readonly<{ at: string; kind: string; step?: number; detail?: string }>[];
}>;

export const RECIPE_STEP_TYPES = [
  'handoff', 'create', 'ensure', 'goto', 'invoke', 'act', 'expect', 'checkpoint',
] as const;

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

  save(value: Omit<ResumeRecipe, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<ResumeRecipe, 'id'>>): ResumeRecipe {
    const now = new Date().toISOString();
    const existing = value.id ? this.get(value.id) : undefined;
    const recipe: ResumeRecipe = {
      ...value,
      id: existing?.id ?? value.id ?? randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
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
      return JSON.parse(readFileSync(this.#path(id), 'utf8')) as ResumeRecipe;
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
    return run;
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

export function parseResumeRecipeInput(value: unknown): (Omit<ResumeRecipe, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<ResumeRecipe, 'id'>>) | string {
  if (!isRecord(value)) return 'A recipe is an object.';
  const { id: rawId, sessionId, beforeSequence, origin, objective, strategy, steps, cleanup, revisions } = value;
  if (rawId !== undefined && (typeof rawId !== 'string' || !ID_PATTERN.test(rawId))) return 'id must be a recipe UUID.';
  if (typeof sessionId !== 'string' || !ID_PATTERN.test(sessionId)) return 'sessionId must be a session UUID.';
  if (beforeSequence !== undefined && (!Number.isInteger(beforeSequence) || (beforeSequence as number) < 0)) return 'beforeSequence must be a non-negative integer.';
  if (typeof origin !== 'string' || !/^https?:\/\/[^/]+$/.test(origin)) return 'origin must be an http(s) origin.';
  if (!isRecord(objective) || typeof objective['goal'] !== 'string' || !objective['goal'].trim() || objective['goal'].length > 500 || !isStringArray(objective['exact']) || !isStringArray(objective['approximate']) || typeof objective['mayWrite'] !== 'boolean') return 'objective must include goal, exact, approximate and mayWrite.';
  if (strategy !== 'autonomous' && strategy !== 'existing') return 'strategy must be autonomous or existing.';
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > MAX_STEPS || !steps.every(isRecipeStep)) return `steps must contain 1–${MAX_STEPS} valid recipe steps.`;
  if (!Array.isArray(cleanup) || cleanup.length > MAX_STEPS || !cleanup.every(isRecipeCall)) return 'cleanup must be a list of Craft calls.';
  if (!Array.isArray(revisions) || !revisions.every(isRevision)) return 'revisions must be { at, by, reason }.';
  const candidate = {
    sessionId,
    ...(typeof beforeSequence === 'number' ? { beforeSequence } : {}),
    origin,
    objective: objective as unknown as ResumeRecipeObjective,
    strategy: strategy as ResumeRecipe['strategy'],
    steps: steps as ResumeRecipeStep[],
    cleanup: cleanup as ResumeRecipeCall[],
    revisions: revisions as ResumeRecipe['revisions'],
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
  return undefined;
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

