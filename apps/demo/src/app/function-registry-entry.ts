import { DestroyRef, inject, Injector } from '@angular/core';
import {
  executeGeneratorCompatibleFactory,
  HOST_TAG_LIST,
  type PrimitiveMethodRuntimeContext,
  type PrimitiveResourceRuntimeContext,
} from '@craft-ng/core';
import {
  buildFunctionRegistryKey,
  getFunctionEntryByKey,
  registerFunctionEntry,
  registerResourceEntry,
} from './function-registry';

type RegistryFactory = (...args: unknown[]) => unknown;

export function ensureFunctionRegistryEntry(
  factory: RegistryFactory,
  thisArg: unknown,
  runtimeContext: PrimitiveMethodRuntimeContext | undefined,
): string {
  // eslint-disable-next-line craft-ng/no-angular-inject
  const hostTags = inject(HOST_TAG_LIST);
  const hostName = hostTags[hostTags.length - 1] ?? 'unknown';
  const ancestry = hostTags.slice(0, -1);
  const key = buildFunctionRegistryKey(hostName, ancestry);
  if (getFunctionEntryByKey(key) !== undefined) {
    return key;
  }

  // Wrapper boundary: retain the original scoped injector for remote replay.
  // eslint-disable-next-line craft-ng/no-angular-inject
  const destroyRef = inject(DestroyRef);
  // eslint-disable-next-line craft-ng/no-angular-inject
  const injector = inject(Injector);
  const cleanup = registerFunctionEntry(
    hostName,
    ancestry,
    (...registryArgs) =>
      executeGeneratorCompatibleFactory({
        factory,
        thisArg,
        getInjector: () => injector,
        args: registryArgs,
        invalidYieldErrorMessage:
          'Registry functions can only yield dependencies available in their original Craft context.',
        multipleAppStartErrorMessage:
          'Registry functions cannot declare multiple app-start hooks.',
        onAppStartNotSupportedErrorMessage:
          'Registry functions cannot declare app-start hooks.',
      }),
    runtimeContext,
  );
  destroyRef.onDestroy(cleanup);
  return key;
}

export function ensureResourceRegistryEntry(
  resourceContext: PrimitiveResourceRuntimeContext,
): string {
  // eslint-disable-next-line craft-ng/no-angular-inject
  const hostTags = inject(HOST_TAG_LIST);
  const hostName = hostTags[hostTags.length - 1] ?? 'unknown';
  const ancestry = hostTags.slice(0, -1);
  const key = buildFunctionRegistryKey(hostName, ancestry);
  if (getFunctionEntryByKey(key)?.primitive !== undefined) {
    return key;
  }

  // Primitive value boundary: expose the live primitive instance for dev-only MCP
  // reads and mutations.
  // eslint-disable-next-line craft-ng/no-angular-inject
  const destroyRef = inject(DestroyRef);
  const cleanup = registerResourceEntry(hostName, ancestry, resourceContext);
  destroyRef.onDestroy(cleanup);
  return key;
}
