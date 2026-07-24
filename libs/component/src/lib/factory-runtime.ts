import {
  Injector,
  runInInjectionContext,
} from '@angular/core';
import {
  executeGeneratorCompatibleFactory,
  executeGeneratorCompatibleFactoryAsync,
  type CraftProgramSettledStep,
  type ResolveGeneratorResult,
} from '@craft-ng/core';
import type { ComponentFactory } from './types';

const INVALID_YIELD =
  'component() factories can only yield craftService dependencies.';
const MULTIPLE_APP_START =
  'component() factories cannot declare onAppStart(...) more than once.';
const APP_START_NOT_SUPPORTED =
  'component() does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.';

export function executeCraftComponentFactory<Factory extends ComponentFactory>(
  factory: Factory,
  args: Parameters<Factory>,
  injector: Injector,
): ResolveGeneratorResult<ReturnType<Factory>> {
  return runInInjectionContext(
    injector,
    () =>
      executeGeneratorCompatibleFactory({
        factory,
        thisArg: undefined,
        getInjector: () => injector,
        args,
        invalidYieldErrorMessage: INVALID_YIELD,
        multipleAppStartErrorMessage: MULTIPLE_APP_START,
        onAppStartNotSupportedErrorMessage: APP_START_NOT_SUPPORTED,
      }) as ResolveGeneratorResult<ReturnType<Factory>>,
  );
}

export function executeCraftComponentFactoryAsync<
  Factory extends ComponentFactory,
>(
  factory: Factory,
  args: Parameters<Factory>,
  injector: Injector,
): Promise<CraftProgramSettledStep> {
  return runInInjectionContext(injector, () =>
    executeGeneratorCompatibleFactoryAsync({
      factory,
      thisArg: undefined,
      getInjector: () => injector,
      args,
      invalidYieldErrorMessage: INVALID_YIELD,
      appStartNotSupportedErrorMessage: APP_START_NOT_SUPPORTED,
    }),
  );
}
