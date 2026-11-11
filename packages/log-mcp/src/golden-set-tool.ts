import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { behaviorCoverageUnit, isGoldenSetManifest, type CoverageBehaviorMatch, type GoldenSetManifest } from '@craft-ts/session-trace';

/** Where an app keeps its golden set, next to its behaviour coverage. */
export const GOLDEN_SET_FILE = '.craft/golden-set.json';
const BEHAVIOR_COVERAGE_FILE = '.craft/behavior-coverage.json';

export type GoldenSetToolInput = Readonly<{
  /** Origin the app is served from while people use it (`http://localhost:4204`). */
  origin: string;
  /** App directory: the previous set and the unproven behaviours are read there. */
  appDir?: string;
  app?: string;
  maxSessions?: number;
  /** Write the proposed manifest to `<appDir>/.craft/golden-set.json`. */
  write?: boolean;
}>;

/**
 * Asks the log server for an app's golden set. With `appDir`, the set in force
 * is sent as `previous` (no churn, lost paths stay listed) and the behaviours
 * no test proves count as priorities.
 */
export async function proposeGoldenSet(input: GoldenSetToolInput, fetchImpl: typeof fetch = fetch) {
  if (input.write && !input.appDir) throw new Error('`write` needs `appDir`.');
  const appDir = input.appDir ? resolve(input.appDir) : undefined;
  const previous = appDir ? readPreviousGoldenSet(appDir) : undefined;
  const priorityUnits = appDir ? unprovenBehaviorUnits(appDir) : [];
  const base = (process.env['LOG_SERVER_URL'] ?? 'http://127.0.0.1:4319').replace(/\/$/, '');
  const response = await fetchImpl(`${base}/sessions/golden-set`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      origin: input.origin,
      app: input.app ?? previous?.app ?? (appDir ? appDir.split(/[\\/]/).pop() : undefined),
      ...(input.maxSessions === undefined ? {} : { maxSessions: input.maxSessions }),
      ...(previous ? { previous } : {}),
      ...(priorityUnits.length ? { priorityUnits } : {}),
    }),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`Golden set unavailable (HTTP ${response.status}): ${String(body['error'] ?? '')}`);
  if (!isGoldenSetManifest(body['manifest'])) throw new Error('The log server answered without a valid golden-set manifest.');
  const manifest = body['manifest'];
  let written: string | undefined;
  if (input.write && appDir) written = writeGoldenSet(appDir, manifest);
  return { ...body, priorityUnits, ...(written ? { written } : {}) };
}

function readPreviousGoldenSet(appDir: string): GoldenSetManifest | undefined {
  const path = join(appDir, GOLDEN_SET_FILE);
  if (!existsSync(path)) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isGoldenSetManifest(parsed)) throw new Error(`${path} is not a golden-set manifest.`);
  return parsed;
}

function unprovenBehaviorUnits(appDir: string): string[] {
  const path = join(appDir, BEHAVIOR_COVERAGE_FILE);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown; behaviors?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.behaviors)) return [];
    return [...new Set((parsed.behaviors as Array<{ status?: unknown; match?: CoverageBehaviorMatch }>)
      .flatMap((behavior) => (behavior.status === 'unproven' && behavior.match ? [behaviorCoverageUnit(behavior.match)] : [])))].sort();
  } catch {
    return [];
  }
}

function writeGoldenSet(appDir: string, manifest: GoldenSetManifest): string {
  const path = join(appDir, GOLDEN_SET_FILE);
  mkdirSync(join(appDir, '.craft'), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(temporary, path);
  return path;
}
