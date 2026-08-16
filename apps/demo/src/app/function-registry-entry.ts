import {
  DestroyRef,
  provideAppInitializer,
  ɵinject as inject,
  ɵInjector as Injector,
  ɵrunInInjectionContext as runInInjectionContext,
} from '@craft-ng/core';
import {
  BrowserDocument,
  BrowserLocation,
  craftUse,
  executeGeneratorCompatibleFactory,
  HOST_TAG_LIST,
  injectPrimitiveMethodRuntimeContext,
  provideFnWrapper,
  ɵinject,
  type PrimitiveMethodRuntimeContext,
  type PrimitiveResourceRuntimeContext,
} from '@craft-ng/core';
import {
  buildFunctionRegistryKey,
  getFunctionEntryByKey,
  registerFunctionEntry,
  registerResourceEntry,
} from './function-registry';
import { provideFnWrapObserver } from '@craft-ng/core';
import { providePrimitiveResourceRuntimeObserver } from '@craft-ng/core';
import { functionRegistry } from './function-registry';
import {
  FUNCTION_REGISTRY_BRIDGE_URL,
  FUNCTION_REGISTRY_CLIENT_ID,
  startFunctionRegistryBridge,
} from './function-registry-bridge';

type RegistryFactory = (...args: unknown[]) => unknown;

export function ensureFunctionRegistryEntry(
  factory: RegistryFactory,
  thisArg: unknown,
  runtimeContext: PrimitiveMethodRuntimeContext | undefined,
): string {
  // eslint-disable-next-line craft-ng/no-angular-inject
  const hostTags = ɵinject(HOST_TAG_LIST);
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
  const hostTags = ɵinject(HOST_TAG_LIST);
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

export const provideMcpExperimentation = () => [
  provideAppInitializer(() => {
    // Bootstrap boundary: the bridge lifetime follows the application injector.
    // eslint-disable-next-line craft-ng/no-angular-inject
    const destroyRef = inject(DestroyRef);
    // eslint-disable-next-line craft-ng/no-angular-inject
    const injector = inject(Injector);
    const stopBridge = startFunctionRegistryBridge({
      injector,
      // eslint-disable-next-line craft-ng/no-angular-inject
      url: inject(FUNCTION_REGISTRY_BRIDGE_URL),
      // eslint-disable-next-line craft-ng/no-angular-inject
      clientId: inject(FUNCTION_REGISTRY_CLIENT_ID),
      getPageInfo: () =>
        runInInjectionContext(injector, () =>
          craftUse(function* () {
            return {
              pageUrl: yield* BrowserLocation.href(),
              pageTitle: yield* BrowserDocument.title(),
            };
          }),
        ),
    });
    destroyRef.onDestroy(stopBridge);
  }),
  provideFnWrapObserver((factory) => {
    const runtimeContext = injectPrimitiveMethodRuntimeContext();
    if (runtimeContext !== undefined) {
      ensureFunctionRegistryEntry(factory, undefined, runtimeContext);
    }
  }),
  // Web MCP experimentation: expose primitive resources to the runtime registry.
  providePrimitiveResourceRuntimeObserver((resourceContext) => {
    ensureResourceRegistryEntry(resourceContext);
  }),
  provideFnWrapper(
    'Warning: dependency injection here is not type-safe and may fail at runtime',
    function* (factory, thisArg, args) {
      const runtimeContext = injectPrimitiveMethodRuntimeContext();
      const key = ensureFunctionRegistryEntry(factory, thisArg, runtimeContext);
      const override = functionRegistry.executeOverride(
        key,
        args,
        runtimeContext,
      );
      if (override.matched) {
        return override.result;
      }
      return yield* factory.apply(thisArg, args);
    },
  ),
];
