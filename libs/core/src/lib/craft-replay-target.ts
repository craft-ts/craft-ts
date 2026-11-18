/** Opaque address for a DOM node rendered by the Craft runtime. */
export type CraftReplayTarget = Readonly<{
  runtimeId: string;
  componentPath: readonly string[];
  localTargetPath: readonly number[];
  /** Omitted means stable; index-derived collection addresses are explicitly marked. */
  stability?: 'stable' | 'unstable';
  fallback?: Readonly<{
    selector?: string;
    clientX?: number;
    clientY?: number;
  }>;
}>;

export type CraftReplayTargetResolution =
  | Readonly<{ status: 'resolved'; element: Element }>
  | Readonly<{
      status: 'missing' | 'ambiguous' | 'foreign-runtime' | 'unstable-identity';
    }>;

// These identifiers are fingerprints, not serialized render paths. Keeping the
// runtime namespace stable lets an exported target resolve in a freshly mounted
// application runtime, while the rendered-node index itself remains ephemeral.
const runtimeId = 'craft-render-runtime-v1';

/**
 * One live association between a rendered element and its Craft address.
 *
 * Mounting an element only links its record. The fingerprint of the address is
 * derived when a capture or a resolution asks for it: an application that is
 * neither recorded nor replayed never reads a render path, never hashes one.
 */
export interface ɵCraftReplayTargetRecord {
  readonly element: Element;
  readonly stable: boolean;
}

type ReplayPathSource =
  | readonly string[]
  | { readonly path: readonly string[] };

class ReplayTargetRecord implements ɵCraftReplayTargetRecord {
  readonly element: Element;
  readonly stable: boolean;
  // The list this record is linked in; none once it is released.
  tree: ReplayTargetTree | undefined;
  previous: ReplayTargetRecord | undefined = undefined;
  next: ReplayTargetRecord | undefined = undefined;
  private readonly source: ReplayPathSource;
  private resolvedId: string | undefined = undefined;

  constructor(
    element: Element,
    source: ReplayPathSource,
    stable: boolean,
    tree: ReplayTargetTree | undefined,
  ) {
    this.element = element;
    this.source = source;
    this.stable = stable;
    this.tree = tree;
  }

  get id(): string {
    if (this.resolvedId !== undefined) return this.resolvedId;
    const source = this.source;
    const path = Array.isArray(source)
      ? source
      : (source as { readonly path: readonly string[] }).path;
    return (this.resolvedId = stableFingerprint(JSON.stringify(path)));
  }
}

/**
 * The live records of one mounted render tree, as a list: linking and
 * unlinking write a few pointers. A tree that is dropped without being
 * destroyed takes its list with it — the runtime only holds trees weakly.
 */
class ReplayTargetTree {
  first: ReplayTargetRecord | undefined;
}
export type ɵCraftReplayTargetTree = ReplayTargetTree;

// Targets registered outside a render tree (the public registration entry).
const detachedTargets = new ReplayTargetTree();
const targetTrees = new Set<WeakRef<ReplayTargetTree>>();
// The index by fingerprint is rebuilt, when a capture or a resolution needs
// it, only after the set of live records changed.
let recordsVersion = 0;
let indexVersion = -1;
const recordsById = new Map<string, ReplayTargetRecord[]>();
// The last address an element was given outlives its release, so an event
// captured while its element is leaving the page still gets an address.
const recordByElement = new WeakMap<Element, ReplayTargetRecord>();

function indexTree(tree: ReplayTargetTree): void {
  for (let record = tree.first; record; record = record.next) {
    const id = record.id;
    const entries = recordsById.get(id);
    if (entries) entries.push(record);
    else recordsById.set(id, [record]);
  }
}

function recordsIndex(): Map<string, ReplayTargetRecord[]> {
  if (indexVersion === recordsVersion) return recordsById;
  recordsById.clear();
  indexTree(detachedTargets);
  for (const reference of targetTrees) {
    const tree = reference.deref();
    if (tree) indexTree(tree);
    else targetTrees.delete(reference);
  }
  indexVersion = recordsVersion;
  return recordsById;
}

/** @internal The target list of a render tree about to be mounted. */
export function ɵcreateCraftReplayTargetTree(): ɵCraftReplayTargetTree {
  const tree = new ReplayTargetTree();
  targetTrees.add(new WeakRef(tree));
  return tree;
}

/**
 * @internal Associate an interpreted element with its Craft render address.
 * `address` is the render path, or what answers it when asked (a render
 * identity): the path is not read until a capture or a resolution needs it.
 */
export function ɵlinkCraftReplayTarget(
  element: Element,
  address: ReplayPathSource,
  stable = true,
  tree: ɵCraftReplayTargetTree = detachedTargets,
): ɵCraftReplayTargetRecord {
  const record = new ReplayTargetRecord(element, address, stable, tree);
  const first = tree.first;
  record.next = first;
  if (first) first.previous = record;
  tree.first = record;
  recordsVersion++;
  recordByElement.set(element, record);
  return record;
}

/** @internal Release an association made by {@link ɵlinkCraftReplayTarget}. */
export function ɵunlinkCraftReplayTarget(
  target: ɵCraftReplayTargetRecord,
): void {
  const record = target as ReplayTargetRecord;
  const tree = record.tree;
  if (!tree) return;
  record.tree = undefined;
  if (record.previous) record.previous.next = record.next;
  else tree.first = record.next;
  if (record.next) record.next.previous = record.previous;
  record.previous = record.next = undefined;
  recordsVersion++;
}

/** @internal Associate an interpreted element with its Craft render address. */
export function ɵregisterCraftReplayTarget(
  element: Element,
  craftPath: readonly string[],
  stable = true,
): () => void {
  const record = ɵlinkCraftReplayTarget(element, craftPath, stable);
  return () => ɵunlinkCraftReplayTarget(record);
}

/** @internal Build a serializable target descriptor for a currently mounted node. */
export function ɵcaptureCraftReplayTarget(
  element: Element,
  fallback?: CraftReplayTarget['fallback'],
): CraftReplayTarget | undefined {
  let target = element;
  const localTargetPath: number[] = [];
  let record = recordByElement.get(target);
  while (!record && target.parentElement) {
    const parent = target.parentElement;
    const childIndex = Array.prototype.indexOf.call(
      parent.children,
      target,
    ) as number;
    if (childIndex < 0) return undefined;
    localTargetPath.unshift(childIndex);
    target = parent;
    record = recordByElement.get(target);
  }
  if (!record) return undefined;
  const targetId = record.id;
  // An address is unstable as long as one live element holds it by position.
  const unstable =
    recordsIndex()
      .get(targetId)
      ?.some((entry) => !entry.stable) ?? false;
  return {
    runtimeId,
    componentPath: [targetId],
    localTargetPath,
    ...(unstable ? { stability: 'unstable' as const } : {}),
    ...(fallback ? { fallback } : {}),
  };
}

/** Resolve only a unique, live node from the runtime's current render tree. */
export function ɵresolveCraftReplayTarget(
  target: CraftReplayTarget,
): CraftReplayTargetResolution {
  if (target.runtimeId !== runtimeId) return { status: 'foreign-runtime' };
  if (target.stability === 'unstable') return { status: 'unstable-identity' };
  const targetId = target.componentPath[0];
  if (!targetId || target.componentPath.length !== 1)
    return { status: 'missing' };
  const entries = recordsIndex().get(targetId);
  if (!entries) return { status: 'missing' };
  let result: Element | undefined;
  for (const entry of entries) {
    if (!entry.element.isConnected) continue;
    if (result) return { status: 'ambiguous' };
    result = entry.element;
  }
  if (!result) return { status: 'missing' };
  let resolved = result;
  for (const childIndex of target.localTargetPath) {
    if (!Number.isSafeInteger(childIndex) || childIndex < 0)
      return { status: 'missing' };
    const child = resolved.children.item(childIndex);
    if (!child) return { status: 'missing' };
    resolved = child;
  }
  return { status: 'resolved', element: resolved };
}

function stableFingerprint(value: string): string {
  // Two independently seeded 32-bit FNV-1a lanes keep the serialized address
  // compact and deterministic without placing component names or collection
  // keys in an archive. Resolution still rejects collisions as ambiguous.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}
