/**
 * Which obligations of the behaviour catalog a test's trace proves.
 *
 * A proof is read from what ran, never from what a test claims: an invocation
 * that succeeded, a server function that answered, a route that activated, a
 * typed exception that surfaced. The trace is the normalised session trace of
 * `@craft-ts/session-trace`, taken structurally — dev-tools depends on no
 * other package.
 *
 * Matching is by name, like the catalog ids: the runtime writes into each
 * invocation step the name the catalog gives it (`detail.behavior`,
 * `cart.addLine`, from `ɵbehaviorTarget` of `@craft-ts/core`), and that step
 * proves `mutation:cart.addLine#success`. The primitive kind is not compared,
 * only the owner and the name, so that a primitive the runtime tags
 * differently from the graph is still found. When
 * a step could prove more than one obligation (two routes with the same path,
 * two endpoints with the same exception) it proves none: a proof is never
 * guessed.
 */
import type { BehaviorCatalog, BehaviorEntry } from './behavior-catalog.ts';

/** The part of a normalised session trace a proof is read from. */
export type BehaviorTraceLike = {
  readonly steps: readonly {
    readonly key: string;
    readonly kind: string;
    readonly detail: Readonly<Record<string, unknown>>;
  }[];
  /**
   * How many steps a passing assertion came after. The steps from this index
   * on were exercised but never observed, and prove nothing. Absent: not
   * recorded (a reference older than the check), every step counts.
   */
  readonly observedSteps?: number;
};

/** Test id → the obligations its trace proves, sorted. */
export type BehaviorProofIndex = Readonly<Record<string, readonly string[]>>;

const INVOKED_KINDS = new Set<BehaviorEntry['kind']>([
  'method',
  'mutation',
  'command',
  'async-process',
  'state-machine',
]);

/** `mutation:cart.addLine#success` → `cart.addLine`. */
const ownerAndName = (id: string): string =>
  id.slice(id.indexOf(':') + 1).replace(/#.*$/, '');

/** `route:ecommerce:formule/:productId` → `formule/:productId`. */
const routePath = (id: string): string => {
  const rest = id.slice('route:'.length);
  return rest.slice(rest.indexOf(':') + 1);
};

export function behaviorProofsFromTrace(
  catalog: BehaviorCatalog,
  trace: BehaviorTraceLike,
): string[] {
  return [...behaviorProofSteps(catalog, trace).keys()].sort();
}

/**
 * Obligation → the keys of the observed steps that prove it, in trace order.
 * The mutant runner breaks exactly these steps.
 */
export function behaviorProofSteps(
  catalog: BehaviorCatalog,
  trace: BehaviorTraceLike,
): Map<string, string[]> {
  const invoked = new Map<string, string[]>();
  const routes = new Map<string, string[]>();
  const exceptions = new Map<string, string[]>();
  const ids = new Set<string>();
  for (const entry of catalog.behaviors) {
    ids.add(entry.id);
    if (INVOKED_KINDS.has(entry.kind)) push(invoked, ownerAndName(entry.id), entry.id);
    if (entry.kind === 'route') push(routes, routePath(entry.id), entry.id);
    if (entry.kind === 'http-exception')
      push(exceptions, entry.id.slice(entry.id.lastIndexOf('#') + 1), entry.id);
  }
  const unique = (candidates: readonly string[] | undefined) =>
    candidates?.length === 1 ? candidates[0] : undefined;

  const proven = new Map<string, string[]>();
  const prove = (id: string | undefined, key: string) => {
    if (!id) return;
    const keys = proven.get(id) ?? [];
    if (!keys.includes(key)) keys.push(key);
    proven.set(id, keys);
  };
  const observed = trace.steps.slice(0, trace.observedSteps ?? trace.steps.length);
  for (const step of observed) {
    if (step.kind === 'invocation' && step.key.startsWith('invocation:')) {
      // The runtime names the invocation as the catalog does (`cart.add`).
      const target = step.detail['behavior'];
      if (typeof target !== 'string') continue;
      if (step.detail['outcome'] === 'succeeded') {
        for (const id of invoked.get(target) ?? []) prove(id, step.key);
      }
      if (step.detail['outcome'] === 'failed') {
        prove(unique(exceptions.get(String(step.detail['exception']))), step.key);
      }
    }
    if (
      step.kind === 'http' &&
      step.key.startsWith('server-fn:') &&
      step.detail['outcome'] === 'ok'
    ) {
      const id = `server-function:${step.key.slice('server-fn:'.length)}`;
      if (ids.has(id)) prove(id, step.key);
    }
    if (step.kind === 'guard' && step.detail['outcome'] === 'allowed') {
      // Named by the runtime as the catalog names it: `demo:admin.canActivate`.
      const id = `guard:${String(step.detail['behavior'])}`;
      if (ids.has(id)) prove(id, step.key);
    }
    if (
      step.kind === 'route' &&
      step.key.startsWith('route-activation:') &&
      step.detail['outcome'] === 'activated'
    ) {
      // Named by the runtime as the catalog names it (`coverage:`); a step
      // without the name proves a route only when its path is unique.
      const named = step.detail['behavior'];
      if (typeof named === 'string') {
        if (ids.has(`route:${named}`)) prove(`route:${named}`, step.key);
      } else {
        prove(unique(routes.get(step.key.slice('route-activation:'.length))), step.key);
      }
    }
  }
  return proven;
}

/**
 * How a step of a trace names an obligation, as data: what a reader outside
 * dev-tools (the log server, looking through recorded debug sessions) needs to
 * find the obligation the way `behaviorProofSteps` does. An obligation without
 * one (a guard, an ambiguous exception) is never matched.
 */
export type BehaviorStepMatch =
  | Readonly<{ step: 'invocation'; outcome: 'succeeded'; target: string }>
  | Readonly<{ step: 'invocation'; outcome: 'failed'; exception: string }>
  | Readonly<{
      step: 'route';
      path: string;
      /** `<collection>:<path>`, as the runtime names the route it activates. */
      behavior: string;
      /** Whether the path alone tells the route, for a step without its name. */
      uniquePath: boolean;
    }>
  | Readonly<{ step: 'server-fn'; id: string }>;

export function behaviorStepMatches(
  catalog: BehaviorCatalog,
): Map<string, BehaviorStepMatch> {
  const count = (values: readonly string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  };
  const tag = (id: string) => id.slice(id.lastIndexOf('#') + 1);
  const routes = count(
    catalog.behaviors.filter((entry) => entry.kind === 'route').map((entry) => routePath(entry.id)),
  );
  const tags = count(
    catalog.behaviors.filter((entry) => entry.kind === 'http-exception').map((entry) => tag(entry.id)),
  );
  const matches = new Map<string, BehaviorStepMatch>();
  for (const entry of catalog.behaviors) {
    if (INVOKED_KINDS.has(entry.kind))
      matches.set(entry.id, { step: 'invocation', outcome: 'succeeded', target: ownerAndName(entry.id) });
    if (entry.kind === 'http-exception' && tags.get(tag(entry.id)) === 1)
      matches.set(entry.id, { step: 'invocation', outcome: 'failed', exception: tag(entry.id) });
    if (entry.kind === 'route')
      matches.set(entry.id, {
        step: 'route',
        path: routePath(entry.id),
        behavior: entry.id.slice('route:'.length),
        uniquePath: routes.get(routePath(entry.id)) === 1,
      });
    if (entry.kind === 'server-function')
      matches.set(entry.id, { step: 'server-fn', id: entry.id.slice('server-function:'.length) });
  }
  return matches;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

export function behaviorProofIndex(
  catalog: BehaviorCatalog,
  traces: Readonly<Record<string, BehaviorTraceLike>>,
): BehaviorProofIndex {
  return Object.fromEntries(
    Object.entries(traces)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([test, trace]) => [test, behaviorProofsFromTrace(catalog, trace)]),
  );
}

export function provenBehaviors(index: BehaviorProofIndex): Set<string> {
  return new Set(Object.values(index).flat());
}
