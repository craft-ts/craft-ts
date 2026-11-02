/**
 * Which obligations of the behaviour catalog a test's trace proves.
 *
 * A proof is read from what ran, never from what a test claims: an invocation
 * that succeeded, a server function that answered, a route that activated, a
 * typed exception that surfaced. The trace is the normalised session trace of
 * `@craft-ts/session-trace`, taken structurally — dev-tools depends on no
 * other package.
 *
 * Matching is by name, like the catalog ids: a runtime address
 * `service:cart / mutation:addLine` proves `mutation:cart.addLine#success`.
 * The primitive kind is not compared, only the owner and the name, so that a
 * primitive the runtime tags differently from the graph is still found. When
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
      const target = invocationTarget(step.key.slice('invocation:'.length));
      if (!target) continue;
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
    if (
      step.kind === 'route' &&
      step.key.startsWith('route-activation:') &&
      step.detail['outcome'] === 'activated'
    ) {
      prove(unique(routes.get(step.key.slice('route-activation:'.length))), step.key);
    }
  }
  return proven;
}

/**
 * `service:session / query:signInProcess` → `session.signInProcess`: the
 * primitive is the last tag, its owner the nearest service or component
 * before it.
 */
function invocationTarget(address: string): string | undefined {
  const tags = address.split(' / ');
  const host = tags[tags.length - 1];
  const name = host?.slice(host.indexOf(':') + 1);
  const owner = [...tags.slice(0, -1)]
    .reverse()
    .find((tag) => tag.startsWith('service:') || tag.startsWith('component:'));
  if (!name || !owner) return undefined;
  return `${owner.slice(owner.indexOf(':') + 1)}.${name}`;
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
