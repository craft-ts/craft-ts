import {
  craftSignal as signal,
  craftUntracked as untracked,
  type Signal,
} from '@craft-ts/core';
import type {
  PrimitiveMethodRuntimeContext,
  PrimitiveMethodRuntimeKind,
  PrimitiveResourceRuntimeContext,
  PrimitiveResourceRuntimeKind,
} from '@craft-ts/core';

const RUNTIME_OPERATIONS = ['get', 'set', 'update', 'patch'] as const;

export type FunctionRegistryEntry = Readonly<{
  key: string;
  hostName: string;
  ancestry: readonly string[];
  capabilities: readonly string[];
  overrideActive: boolean;
}>;

export type FunctionRegistryEntryDetails = FunctionRegistryEntry &
  Readonly<{
    originalSource?: string;
    primitive?: Readonly<{
      kind: PrimitiveResourceRuntimeKind;
      grouped: boolean;
      ids: readonly string[];
    }>;
    override?: Readonly<{
      source: string;
      installedAt: string;
    }>;
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
    | 'override-installed'
    | 'override-removed'
    | 'override-succeeded'
    | 'override-failed'
    | 'primitive-read'
    | 'primitive-mutated'
    | 'primitive-failed'
    | 'bridge';
  key?: string;
  message: string;
}>;

type FunctionRef = (...args: unknown[]) => unknown;
type RuntimeOverride = (context: RuntimeOverrideContext) => unknown;

type RuntimePrimitiveApi = Readonly<{
  get(): unknown;
  set(value: unknown): unknown;
  update(updater: (current: unknown) => unknown): unknown;
  patch(updater: (current: unknown) => object): unknown;
}>;

type RuntimeOverrideContext = Readonly<
  {
    args: readonly unknown[];
  } & Partial<Record<PrimitiveMethodRuntimeKind, RuntimePrimitiveApi>>
>;

type InternalEntry = Readonly<{
  key: string;
  hostName: string;
  ancestry: readonly string[];
  functionRef: FunctionRef;
  runtimeContext?: PrimitiveMethodRuntimeContext;
  resourceContext?: PrimitiveResourceRuntimeContext;
}>;

type InternalOverride = Readonly<{
  source: string;
  installedAt: string;
  functionRef: RuntimeOverride;
}>;

export type OverrideExecution =
  | Readonly<{ matched: false }>
  | Readonly<{ matched: true; result: unknown }>;

export type FunctionRegistry = Readonly<{
  entries: Signal<readonly FunctionRegistryEntry[]>;
  logs: Signal<readonly FunctionRegistryLog[]>;
  register(
    hostName: string,
    ancestry: readonly string[],
    functionRef: FunctionRef,
    runtimeContext?: PrimitiveMethodRuntimeContext,
  ): () => void;
  registerResource(
    hostName: string,
    ancestry: readonly string[],
    resourceContext: PrimitiveResourceRuntimeContext,
  ): () => void;
  get(key: string): FunctionRegistryEntryDetails | undefined;
  invoke(key: string, args?: readonly unknown[]): unknown;
  resourceGet(
    key: string,
    id?: string,
    expectedKind?: PrimitiveResourceRuntimeKind,
  ): unknown;
  resourceSet(
    key: string,
    value: unknown,
    id?: string,
    expectedKind?: PrimitiveResourceRuntimeKind,
  ): unknown;
  resourceUpdate(
    key: string,
    source: string,
    id?: string,
    expectedKind?: PrimitiveResourceRuntimeKind,
  ): unknown;
  resourcePatch(
    key: string,
    source: string,
    id?: string,
    expectedKind?: PrimitiveResourceRuntimeKind,
  ): unknown;
  override(key: string, source: string): FunctionRegistryEntryDetails;
  restore(key: string): FunctionRegistryEntryDetails | undefined;
  executeOverride(
    key: string,
    args: readonly unknown[],
    runtimeContext?: PrimitiveMethodRuntimeContext,
  ): OverrideExecution;
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
  const overrides = new Map<string, InternalOverride>();
  const publicEntries = signal<readonly FunctionRegistryEntry[]>([]);
  const publicLogs = signal<readonly FunctionRegistryLog[]>([]);
  const replaceEntries = (entries: readonly FunctionRegistryEntry[]): void => {
    publicEntries.set(entries);
  };
  const appendLogEntry = (log: FunctionRegistryLog): void => {
    publicLogs.update((logs) => [...logs, log].slice(-MAX_LOG_ENTRIES));
  };
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
    untracked(() => appendLogEntry(log));
  };

  const toPublicEntry = (entry: InternalEntry): FunctionRegistryEntry => {
    const methodKind = entry.runtimeContext?.kind;
    const resourceKind = entry.resourceContext?.kind;
    return {
      key: entry.key,
      hostName: entry.hostName,
      ancestry: entry.ancestry,
      capabilities: [
        ...new Set([
          ...(methodKind === undefined
            ? []
            : RUNTIME_OPERATIONS.map(
                (operation) => `${methodKind}.${operation}`,
              )),
          ...(resourceKind === undefined
            ? []
            : [
                ...RUNTIME_OPERATIONS.map(
                  (operation) => `${resourceKind}.${operation}`,
                ),
                ...(entry.resourceContext?.grouped
                  ? [`${resourceKind}.ids`, `${resourceKind}.select`]
                  : []),
              ]),
        ]),
      ],
      overrideActive: overrides.has(entry.key),
    };
  };

  const toDetails = (entry: InternalEntry): FunctionRegistryEntryDetails => {
    const override = overrides.get(entry.key);
    return {
      ...toPublicEntry(entry),
      ...(entry.runtimeContext === undefined
        ? {}
        : { originalSource: entry.runtimeContext.originalSource }),
      ...(entry.resourceContext === undefined
        ? {}
        : {
            primitive: {
              kind: entry.resourceContext.kind,
              grouped: entry.resourceContext.grouped,
              ids: entry.resourceContext.ids(),
            },
          }),
      ...(override === undefined
        ? {}
        : {
            override: {
              source: override.source,
              installedAt: override.installedAt,
            },
          }),
    };
  };

  const publishEntries = (): void => {
    untracked(() => {
      replaceEntries(Array.from(internalEntries.values(), toPublicEntry));
    });
  };

  const observeOverrideResult = (key: string, result: unknown): unknown => {
    if (isPromiseLike(result)) {
      return result.then(
        (value) => {
          appendLog('override-succeeded', `Override called for ${key}`, key);
          return value;
        },
        (error: unknown) => {
          appendLog('override-failed', formatOverrideFailure(key, error), key);
          throw error;
        },
      );
    }
    appendLog('override-succeeded', `Override called for ${key}`, key);
    return result;
  };

  return {
    entries: publicEntries.asReadonly(),
    logs: publicLogs.asReadonly(),

    register(hostName, ancestry, functionRef, runtimeContext) {
      const key = buildFunctionRegistryKey(hostName, ancestry);
      const entry: InternalEntry = {
        key,
        hostName,
        ancestry: [...ancestry],
        functionRef,
        ...(runtimeContext === undefined ? {} : { runtimeContext }),
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

    registerResource(hostName, ancestry, resourceContext) {
      const key = buildFunctionRegistryKey(hostName, ancestry);
      const entry: InternalEntry = {
        key,
        hostName,
        ancestry: [...ancestry],
        functionRef: () => resourceContext.get(),
        resourceContext,
      };

      internalEntries.set(key, entry);
      publishEntries();
      appendLog('registered', `Registered primitive value ${key}`, key);

      return () => {
        if (internalEntries.get(key) !== entry) {
          return;
        }
        internalEntries.delete(key);
        publishEntries();
        appendLog('removed', `Removed primitive value ${key}`, key);
      };
    },

    get(key) {
      const entry = internalEntries.get(key);
      return entry === undefined ? undefined : toDetails(entry);
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

    resourceGet(key, id, expectedKind) {
      const resource = requireResourceContext(
        internalEntries,
        key,
        expectedKind,
      );
      try {
        const result = resource.get(id);
        appendLog('primitive-read', formatResourceSuccess(key, 'get', id), key);
        return result;
      } catch (error) {
        appendLog(
          'primitive-failed',
          formatResourceFailure(key, 'get', error, id),
          key,
        );
        throw error;
      }
    },

    resourceSet(key, value, id, expectedKind) {
      const resource = requireResourceContext(
        internalEntries,
        key,
        expectedKind,
      );
      try {
        resource.set(value, id);
        appendLog(
          'primitive-mutated',
          formatResourceSuccess(key, 'set', id),
          key,
        );
        publishEntries();
        return resource.get(id);
      } catch (error) {
        appendLog(
          'primitive-failed',
          formatResourceFailure(key, 'set', error, id),
          key,
        );
        throw error;
      }
    },

    resourceUpdate(key, source, id, expectedKind) {
      const resource = requireResourceContext(
        internalEntries,
        key,
        expectedKind,
      );
      const updater = compileResourceUpdater(source, 'update');
      try {
        resource.update(updater, id);
        appendLog(
          'primitive-mutated',
          formatResourceSuccess(key, 'update', id),
          key,
        );
        publishEntries();
        return resource.get(id);
      } catch (error) {
        appendLog(
          'primitive-failed',
          formatResourceFailure(key, 'update', error, id),
          key,
        );
        throw error;
      }
    },

    resourcePatch(key, source, id, expectedKind) {
      const resource = requireResourceContext(
        internalEntries,
        key,
        expectedKind,
      );
      const updater = compileResourceUpdater(source, 'patch') as (
        current: unknown,
      ) => object;
      try {
        resource.patch(updater, id);
        appendLog(
          'primitive-mutated',
          formatResourceSuccess(key, 'patch', id),
          key,
        );
        publishEntries();
        return resource.get(id);
      } catch (error) {
        appendLog(
          'primitive-failed',
          formatResourceFailure(key, 'patch', error, id),
          key,
        );
        throw error;
      }
    },

    override(key, source) {
      const entry = requireEntry(internalEntries, key);
      if (entry.runtimeContext === undefined) {
        throw new Error(
          `Registry entry "${key}" does not expose primitive runtime capabilities`,
        );
      }
      const functionRef = compileOverride(source);
      overrides.set(key, {
        source,
        installedAt: new Date().toISOString(),
        functionRef,
      });
      publishEntries();
      appendLog('override-installed', `Override installed for ${key}`, key);
      return toDetails(entry);
    },

    restore(key) {
      if (!overrides.delete(key)) {
        throw new Error(`Registry entry "${key}" has no active override`);
      }
      publishEntries();
      appendLog('override-removed', `Override removed for ${key}`, key);
      const entry = internalEntries.get(key);
      return entry === undefined ? undefined : toDetails(entry);
    },

    executeOverride(key, args, runtimeContext) {
      const override = overrides.get(key);
      if (override === undefined) {
        return { matched: false };
      }
      if (runtimeContext === undefined) {
        const error = new Error(
          `Registry entry "${key}" lost its primitive runtime capabilities`,
        );
        appendLog('override-failed', formatOverrideFailure(key, error), key);
        throw error;
      }

      const primitive = Object.freeze({
        get: () => runtimeContext.get(),
        set: (value: unknown) => runtimeContext.set(value),
        update: (updater: (current: unknown) => unknown) =>
          runtimeContext.update(updater),
        patch: (updater: (current: unknown) => object) =>
          runtimeContext.patch(updater),
      });
      const context = Object.freeze({
        args: Object.freeze([...args]),
        [runtimeContext.kind]: primitive,
      });
      try {
        return {
          matched: true,
          result: observeOverrideResult(key, override.functionRef(context)),
        };
      } catch (error) {
        appendLog('override-failed', formatOverrideFailure(key, error), key);
        throw error;
      }
    },

    logBridge(message) {
      appendLog('bridge', message);
    },
  };
}

function requireEntry(
  entries: ReadonlyMap<string, InternalEntry>,
  key: string,
): InternalEntry {
  const entry = entries.get(key);
  if (entry === undefined) {
    throw new Error(`Registry entry "${key}" is not available`);
  }
  return entry;
}

function requireResourceContext(
  entries: ReadonlyMap<string, InternalEntry>,
  key: string,
  expectedKind?: PrimitiveResourceRuntimeKind,
): PrimitiveResourceRuntimeContext {
  const entry = requireEntry(entries, key);
  if (entry.resourceContext === undefined) {
    throw new Error(
      `Registry entry "${key}" does not expose primitive value capabilities`,
    );
  }
  if (
    expectedKind !== undefined &&
    entry.resourceContext.kind !== expectedKind
  ) {
    throw new Error(
      `Registry entry "${key}" exposes ${entry.resourceContext.kind} capabilities, not ${expectedKind}`,
    );
  }
  return entry.resourceContext;
}

function compileOverride(source: string): RuntimeOverride {
  if (source.trim().length === 0) {
    throw new Error('Override source must not be empty');
  }
  let candidate: unknown;
  try {
    // Development-only dynamic code path. The caller explicitly controls source.
    candidate = new Function(`"use strict"; return (${source});`)();
  } catch (error) {
    throw new Error(
      `Invalid override source: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof candidate !== 'function') {
    throw new Error('Override source must evaluate to a function');
  }
  return candidate as RuntimeOverride;
}

function compileResourceUpdater(
  source: string,
  operation: 'update' | 'patch',
): (current: unknown) => unknown {
  if (source.trim().length === 0) {
    throw new Error(`registry.${operation} params.source must not be empty`);
  }
  let candidate: unknown;
  try {
    // Development-only dynamic code path. The caller explicitly controls source.
    candidate = new Function(`"use strict"; return (${source});`)();
  } catch (error) {
    throw new Error(
      `Invalid primitive value ${operation} source: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof candidate !== 'function') {
    throw new Error(
      `Primitive value ${operation} source must evaluate to a function`,
    );
  }
  return candidate as (current: unknown) => unknown;
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

function formatOverrideFailure(key: string, error: unknown): string {
  return `Override for ${key} failed: ${error instanceof Error ? error.message : String(error)}`;
}

function formatResourceSuccess(
  key: string,
  operation: string,
  id: string | undefined,
): string {
  return `Primitive value ${operation} succeeded for ${formatResourceTarget(key, id)}`;
}

function formatResourceFailure(
  key: string,
  operation: string,
  error: unknown,
  id: string | undefined,
): string {
  return `Primitive value ${operation} failed for ${formatResourceTarget(key, id)}: ${error instanceof Error ? error.message : String(error)}`;
}

function formatResourceTarget(key: string, id: string | undefined): string {
  return id === undefined ? key : `${key}#${id}`;
}

export const functionRegistry = createFunctionRegistry();
export const functionRegistryEntries = functionRegistry.entries;
export const functionRegistryLogs = functionRegistry.logs;

export function registerFunctionEntry(
  hostName: string,
  ancestry: readonly string[],
  functionRef: FunctionRef,
  runtimeContext?: PrimitiveMethodRuntimeContext,
): () => void {
  return functionRegistry.register(
    hostName,
    ancestry,
    functionRef,
    runtimeContext,
  );
}

export function registerResourceEntry(
  hostName: string,
  ancestry: readonly string[],
  resourceContext: PrimitiveResourceRuntimeContext,
): () => void {
  return functionRegistry.registerResource(hostName, ancestry, resourceContext);
}

export function getFunctionEntryByKey(
  key: string,
): FunctionRegistryEntryDetails | undefined {
  return functionRegistry.get(key);
}

export function getFunctionEntry(
  hostName: string,
  ancestry: readonly string[],
): FunctionRegistryEntryDetails | undefined {
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
