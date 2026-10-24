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
const elementsById = new Map<string, Set<WeakRef<Element>>>();
const idsByElement = new WeakMap<Element, string>();
const unstableIds = new Set<string>();

/** @internal Associate an interpreted element with its Craft render address. */
export function ɵregisterCraftReplayTarget(
  element: Element,
  craftPath: readonly string[],
  stable = true,
): () => void {
  const pathKey = JSON.stringify(craftPath);
  const targetId = stableFingerprint(pathKey);
  const entries = elementsById.get(targetId) ?? new Set<WeakRef<Element>>();
  const reference = new WeakRef(element);
  entries.add(reference);
  elementsById.set(targetId, entries);
  idsByElement.set(element, targetId);
  if (!stable) unstableIds.add(targetId);
  return () => {
    entries.delete(reference);
    if (entries.size === 0) {
      elementsById.delete(targetId);
      unstableIds.delete(targetId);
    }
  };
}

/** @internal Build a serializable target descriptor for a currently mounted node. */
export function ɵcaptureCraftReplayTarget(
  element: Element,
  fallback?: CraftReplayTarget['fallback'],
): CraftReplayTarget | undefined {
  let target = element;
  const localTargetPath: number[] = [];
  let targetId = idsByElement.get(target);
  while (!targetId && target.parentElement) {
    const parent = target.parentElement;
    const childIndex = Array.prototype.indexOf.call(parent.children, target) as number;
    if (childIndex < 0) return undefined;
    localTargetPath.unshift(childIndex);
    target = parent;
    targetId = idsByElement.get(target);
  }
  if (!targetId) return undefined;
  return {
    runtimeId,
    componentPath: [targetId],
    localTargetPath,
    ...(unstableIds.has(targetId) ? { stability: 'unstable' as const } : {}),
    ...(fallback ? { fallback } : {}),
  };
}

/** Resolve only a unique, live node from the runtime's current render tree. */
export function ɵresolveCraftReplayTarget(
  target: CraftReplayTarget,
): CraftReplayTargetResolution {
  if (target.runtimeId !== runtimeId)
    return { status: 'foreign-runtime' };
  if (target.stability === 'unstable')
    return { status: 'unstable-identity' };
  const targetId = target.componentPath[0];
  if (!targetId || target.componentPath.length !== 1)
    return { status: 'missing' };
  const entries = elementsById.get(targetId);
  if (!entries) return { status: 'missing' };
  let result: Element | undefined;
  for (const reference of [...entries]) {
    const element = reference.deref();
    if (!element || !element.isConnected) {
      entries.delete(reference);
      continue;
    }
    if (result) return { status: 'ambiguous' };
    result = element;
  }
  if (entries.size === 0) {
    elementsById.delete(targetId);
    unstableIds.delete(targetId);
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
