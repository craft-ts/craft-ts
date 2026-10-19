/** Result of resolving a semantic deferred-node replay address. */
export type CraftDeferReplayResolution =
  | Readonly<{
      status: 'resolved';
      activate: () => Promise<'loaded' | 'error'>;
    }>
  | Readonly<{ status: 'missing' | 'ambiguous' | 'unstable-identity' }>;

type Entry = { activate: () => Promise<'loaded' | 'error'>; stable: boolean };
const entriesById = new Map<string, Set<Entry>>();

/** @internal Register a mounted deferNode for semantic replay. */
export function ɵregisterCraftDeferReplayTarget(
  path: readonly string[],
  activate: () => Promise<'loaded' | 'error'>,
  stable = true,
): Readonly<{ id: string; unregister: () => void }> {
  const id = fingerprint(JSON.stringify(path));
  const entries = entriesById.get(id) ?? new Set<Entry>();
  const entry = { activate, stable };
  entries.add(entry);
  entriesById.set(id, entries);
  return {
    id,
    unregister: () => {
      entries.delete(entry);
      if (!entries.size) entriesById.delete(id);
    },
  };
}

/** @internal Resolve a deferNode by its deterministic render identity. */
export function ɵresolveCraftDeferReplayTarget(
  id: string,
): CraftDeferReplayResolution {
  const entries = entriesById.get(id);
  if (!entries?.size) return { status: 'missing' };
  if ([...entries].some((entry) => !entry.stable))
    return { status: 'unstable-identity' };
  if (entries.size !== 1) return { status: 'ambiguous' };
  return { status: 'resolved', activate: [...entries][0]!.activate };
}

function fingerprint(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}
