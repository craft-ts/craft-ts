import type { SessionTrace, SessionTraceStep } from './normalize.js';

/**
 * What a session covers, in units that mean something to the application and
 * survive a refactor: a route, a method with its outcome, a server function,
 * an exception, a journey edge. Never lines of JavaScript, never values.
 *
 * Unit ids are `<family>:<name>[:<qualifier>]`; the family is the prefix up to
 * the first colon.
 */
export type CoverageUnitFamily =
  | 'route'
  | 'route-activation'
  | 'flow'
  | 'invocation'
  | 'exception'
  | 'server-fn'
  | 'http'
  | 'checkpoint'
  | 'interaction';

export const COVERAGE_UNIT_FAMILIES: readonly CoverageUnitFamily[] = [
  'route', 'route-activation', 'flow', 'invocation', 'exception', 'server-fn', 'http', 'checkpoint', 'interaction',
];

/**
 * Default worth of a unit when choosing sessions. Failures and rare paths are
 * worth more than a state that changed: a suite that never shows an error
 * proves little.
 */
export const DEFAULT_COVERAGE_UNIT_WEIGHTS: Readonly<Record<CoverageUnitFamily, number>> = {
  exception: 5,
  'server-fn': 3,
  invocation: 3,
  'route-activation': 2,
  route: 2,
  interaction: 2,
  http: 1,
  flow: 1,
  checkpoint: 1,
};

/** Units that point at a failure, whatever their family, weigh this much. */
export const FAILURE_COVERAGE_UNIT_WEIGHT = 4;

/** The sorted, distinct coverage units of one normalized trace. */
export function sessionCoverageUnits(trace: Pick<SessionTrace, 'steps'>): readonly string[] {
  const units = new Set<string>();
  const lastRoute = new Map<string, string>();
  const hasActivations = trace.steps.some((step) => step.key.startsWith('route-activation:'));
  const visit = (participant: string, route: string) => {
    const previous = lastRoute.get(participant);
    if (previous !== undefined && previous !== route) units.add(`flow:${previous} -> ${route}`);
    lastRoute.set(participant, route);
  };
  for (const step of trace.steps) {
    for (const unit of stepUnits(step)) units.add(unit);
    // A journey edge joins two pages a participant saw in a row; activations
    // name the route as configured, navigations only by its URL.
    if (hasActivations && step.key.startsWith('route-activation:') && step.detail['outcome'] === 'activated')
      visit(step.participant, routeActivationName(step));
    else if (!hasActivations && step.kind === 'route' && step.key.startsWith('route:') && navigationSuffix(step.key) === undefined)
      visit(step.participant, pathPattern(step.key.slice('route:'.length)));
  }
  return [...units].sort();
}

/** Family of a unit id. */
export function coverageUnitFamily(unit: string): CoverageUnitFamily | undefined {
  const family = unit.slice(0, unit.indexOf(':'));
  return (COVERAGE_UNIT_FAMILIES as readonly string[]).includes(family) ? (family as CoverageUnitFamily) : undefined;
}

/** Whether a unit names a failure (an exception, an error response, a refused route). */
export function isFailureCoverageUnit(unit: string): boolean {
  // Qualifiers are a closed list per family, read only where the family puts
  // them: a route's name may itself hold `:error` (`shop:error`).
  switch (coverageUnitFamily(unit)) {
    case 'exception': return true;
    case 'route': return /:(cancel|error)$/.test(unit);
    case 'route-activation':
    case 'invocation': return unit.endsWith(':failed');
    case 'server-fn':
    case 'http': return /:error(:(4xx|5xx|network))?$/.test(unit);
    default: return false;
  }
}

/** Default weight of one unit. */
export function defaultCoverageUnitWeight(unit: string): number {
  const family = coverageUnitFamily(unit);
  const base = family ? DEFAULT_COVERAGE_UNIT_WEIGHTS[family] : 1;
  return isFailureCoverageUnit(unit) ? Math.max(base, FAILURE_COVERAGE_UNIT_WEIGHT) : base;
}

/**
 * The step a behaviour of the catalog is shown by (written by
 * `behaviorCoverage` of `@craft-ts/dev-tools`), read structurally.
 */
export type CoverageBehaviorMatch =
  | Readonly<{ step: 'invocation'; outcome: 'succeeded'; target: string }>
  | Readonly<{ step: 'invocation'; outcome: 'failed'; exception: string }>
  | Readonly<{ step: 'route'; path: string; behavior?: string; uniquePath?: boolean }>
  | Readonly<{ step: 'server-fn'; id: string }>;

/** The unit a session must hold to show a behaviour of the catalog. */
export function behaviorCoverageUnit(match: CoverageBehaviorMatch): string {
  if (match.step === 'invocation')
    return 'target' in match ? `invocation:${match.target}` : `exception:${match.exception}`;
  if (match.step === 'route') return `route-activation:${match.behavior ?? match.path}`;
  return `server-fn:${match.id}:ok`;
}

function stepUnits(step: SessionTraceStep): readonly string[] {
  const detail = step.detail;
  if (step.key.startsWith('route-activation:')) {
    const name = routeActivationName(step);
    const outcome = typeof detail['outcome'] === 'string' ? detail['outcome'] : 'activated';
    return [outcome === 'activated' ? `route-activation:${name}` : `route-activation:${name}:${outcome}`];
  }
  if (step.kind === 'route' && step.key.startsWith('route:')) {
    const rest = step.key.slice('route:'.length);
    const suffix = navigationSuffix(step.key);
    const path = pathPattern(suffix === undefined ? rest : rest.slice(0, -suffix.length - 1));
    // The end of a navigation adds nothing to its start; a cancel or an error does.
    if (suffix === undefined) return [`route:${path}`];
    return suffix === 'end' ? [] : [`route:${path}:${suffix}`];
  }
  if (step.kind === 'invocation') {
    const name = typeof detail['behavior'] === 'string' ? detail['behavior'] : step.key.slice('invocation:'.length);
    if (detail['outcome'] === 'failed')
      return [`invocation:${name}:failed`, `exception:${String(detail['exception'] ?? 'unknown')}`];
    return detail['outcome'] === 'succeeded' ? [`invocation:${name}`] : [];
  }
  if (step.kind === 'http') {
    if (detail['outcome'] === 'pending') return [];
    const failure = detail['outcome'] === 'error' ? `:error${statusClass(detail['status'])}` : '';
    if (step.key.startsWith('server-fn:')) return [`server-fn:${step.key.slice('server-fn:'.length)}${failure ? failure : ':ok'}`];
    const [, method = 'GET', ...path] = step.key.split(':');
    return [`http:${method}:${pathPattern(path.join(':'))}${failure ? failure : ':ok'}`];
  }
  if (step.kind === 'checkpoint') return [step.key];
  if (step.kind === 'interaction') return [step.key];
  return [];
}

function routeActivationName(step: SessionTraceStep): string {
  return typeof step.detail['behavior'] === 'string' ? step.detail['behavior'] : step.key.slice('route-activation:'.length);
}

const PLACEHOLDERS = new Set(['uuid', 'n', 'time', 'redacted', 'id']);

/**
 * The router event a navigation step is suffixed with (`end`, `cancel`, …),
 * or `undefined` for its start. Placeholders the normalizer writes (`:uuid`)
 * are not suffixes.
 */
function navigationSuffix(key: string): string | undefined {
  const suffix = /:([a-z]+)$/.exec(key.slice('route:'.length))?.[1];
  return suffix === undefined || PLACEHOLDERS.has(suffix) ? undefined : suffix;
}

/**
 * A URL path reduced to its shape: a segment holding a digit or a placeholder
 * is an identifier (`/produits/42` and `/produits/7` are one page).
 */
function pathPattern(path: string): string {
  return path.split('/').map((segment) => (/\d/.test(segment) || segment.startsWith(':') ? ':id' : segment)).join('/') || '/';
}

function statusClass(status: unknown): string {
  if (typeof status !== 'number') return ':network';
  return status >= 500 ? ':5xx' : status >= 400 ? ':4xx' : '';
}
