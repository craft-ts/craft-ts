export type RegisteredFunctionEntry = Readonly<{
  hostName: string;
  ancestry: readonly string[];
  functionRef: (...args: unknown[]) => unknown;
}>;

const entries = new Map<string, RegisteredFunctionEntry>();

function buildFunctionRegistryKey(
  hostName: string,
  ancestry: readonly string[],
): string {
  return ancestry.length === 0
    ? hostName
    : `${hostName} <= ${ancestry.join(' > ')}`;
}

export function registerFunctionEntry(
  hostName: string,
  ancestry: readonly string[],
  functionRef: (...args: unknown[]) => unknown,
): () => void {
  const key = buildFunctionRegistryKey(hostName, ancestry);
  const entry: RegisteredFunctionEntry = {
    hostName,
    ancestry: [...ancestry],
    functionRef,
  };

  entries.set(key, entry);

  return () => {
    if (entries.get(key) === entry) {
      entries.delete(key);
    }
  };
}

export function getFunctionEntry(
  hostName: string,
  ancestry: readonly string[],
): RegisteredFunctionEntry | undefined {
  return entries.get(buildFunctionRegistryKey(hostName, ancestry));
}

export function listFunctionEntries(): Array<
  RegisteredFunctionEntry & { key: string }
> {
  return Array.from(entries.entries()).map(([key, entry]) => ({
    key,
    ...entry,
  }));
}
