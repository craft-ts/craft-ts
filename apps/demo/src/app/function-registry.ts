import { signal, untracked, type Signal } from '@angular/core';

export type FunctionRegistryEntry = Readonly<{
  key: string;
  hostName: string;
  ancestry: readonly string[];
}>;

export type FunctionRegistryLog = Readonly<{
  id: number;
  timestamp: string;
  event:
    | 'registered'
    | 'removed'
    | 'call-started'
    | 'call-succeeded'
    | 'call-failed'
    | 'bridge';
  key?: string;
  message: string;
}>;

type FunctionRef = (...args: unknown[]) => unknown;

type InternalEntry = FunctionRegistryEntry &
  Readonly<{
    functionRef: FunctionRef;
  }>;

export type FunctionRegistry = Readonly<{
  entries: Signal<readonly FunctionRegistryEntry[]>;
  logs: Signal<readonly FunctionRegistryLog[]>;
  register(
    hostName: string,
    ancestry: readonly string[],
    functionRef: FunctionRef,
  ): () => void;
  get(key: string): FunctionRegistryEntry | undefined;
  invoke(key: string, args?: readonly unknown[]): unknown;
  logBridge(message: string): void;
}>;

const MAX_LOG_ENTRIES = 500;

export function buildFunctionRegistryKey(
  hostName: string,
  ancestry: readonly string[],
): string {
  return ancestry.length === 0
    ? hostName
    : `${hostName} <= ${ancestry.join(' > ')}`;
}

export function createFunctionRegistry(): FunctionRegistry {
  const internalEntries = new Map<string, InternalEntry>();
  const publicEntries = signal<readonly FunctionRegistryEntry[]>([]);
  const publicLogs = signal<readonly FunctionRegistryLog[]>([]);
  let nextLogId = 1;

  const appendLog = (
    event: FunctionRegistryLog['event'],
    message: string,
    key?: string,
  ): void => {
    const log: FunctionRegistryLog = {
      id: nextLogId++,
      timestamp: new Date().toISOString(),
      event,
      message,
      ...(key === undefined ? {} : { key }),
    };
    untracked(() =>
      publicLogs.update((logs) => [...logs, log].slice(-MAX_LOG_ENTRIES)),
    );
  };

  const publishEntries = (): void => {
    untracked(() =>
      publicEntries.set(
        Array.from(internalEntries.values(), ({ key, hostName, ancestry }) => ({
          key,
          hostName,
          ancestry,
        })),
      ),
    );
  };

  return {
    entries: publicEntries.asReadonly(),
    logs: publicLogs.asReadonly(),

    register(hostName, ancestry, functionRef) {
      const key = buildFunctionRegistryKey(hostName, ancestry);
      const entry: InternalEntry = {
        key,
        hostName,
        ancestry: [...ancestry],
        functionRef,
      };

      internalEntries.set(key, entry);
      publishEntries();
      appendLog('registered', `Registered ${key}`, key);

      return () => {
        if (internalEntries.get(key) !== entry) {
          return;
        }
        internalEntries.delete(key);
        publishEntries();
        appendLog('removed', `Removed ${key}`, key);
      };
    },

    get(key) {
      const entry = internalEntries.get(key);
      return entry === undefined
        ? undefined
        : {
            key: entry.key,
            hostName: entry.hostName,
            ancestry: entry.ancestry,
          };
    },

    invoke(key, args = []) {
      const entry = internalEntries.get(key);
      if (entry === undefined) {
        const message = `Registry entry "${key}" is not available`;
        appendLog('call-failed', message, key);
        throw new Error(message);
      }

      appendLog('call-started', `Calling ${key}`, key);
      try {
        const result = entry.functionRef(...args);
        if (isPromiseLike(result)) {
          return result.then(
            (value) => {
              appendLog('call-succeeded', `Called ${key}`, key);
              return value;
            },
            (error: unknown) => {
              appendLog('call-failed', formatCallFailure(key, error), key);
              throw error;
            },
          );
        }
        appendLog('call-succeeded', `Called ${key}`, key);
        return result;
      } catch (error) {
        appendLog('call-failed', formatCallFailure(key, error), key);
        throw error;
      }
    },

    logBridge(message) {
      appendLog('bridge', message);
    },
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function formatCallFailure(key: string, error: unknown): string {
  return `Call to ${key} failed: ${error instanceof Error ? error.message : String(error)}`;
}

export const functionRegistry = createFunctionRegistry();
export const functionRegistryEntries = functionRegistry.entries;
export const functionRegistryLogs = functionRegistry.logs;

export function registerFunctionEntry(
  hostName: string,
  ancestry: readonly string[],
  functionRef: FunctionRef,
): () => void {
  return functionRegistry.register(hostName, ancestry, functionRef);
}

export function getFunctionEntryByKey(
  key: string,
): FunctionRegistryEntry | undefined {
  return functionRegistry.get(key);
}

export function getFunctionEntry(
  hostName: string,
  ancestry: readonly string[],
): FunctionRegistryEntry | undefined {
  return getFunctionEntryByKey(buildFunctionRegistryKey(hostName, ancestry));
}

export function listFunctionEntries(): readonly FunctionRegistryEntry[] {
  return functionRegistryEntries();
}

export function invokeFunctionEntry(
  key: string,
  args: readonly unknown[] = [],
): unknown {
  return functionRegistry.invoke(key, args);
}
