import {
  executeGeneratorCompatibleFactory,
  executeGeneratorCompatibleFactoryAsync,
  type CraftInjector,
  type CraftProgramSettledStep,
  type ResolveGeneratorResult,
  ɵcraftInjectorFromHost,
} from '@craft-ng/core';
import type { ComponentFactory } from './types';

const INVALID_YIELD =
  'craftComponent() factories can only yield craftService dependencies.';
const MULTIPLE_APP_START =
  'craftComponent() factories cannot declare onAppStart(...) more than once.';
const APP_START_NOT_SUPPORTED =
  'craftComponent() does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.';

export function executeCraftComponentFactory<Factory extends ComponentFactory>(
  factory: Factory,
  args: Parameters<Factory>,
  injector: CraftInjector | object,
): ResolveGeneratorResult<ReturnType<Factory>> {
  return ɵcraftInjectorFromHost(injector).run(
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
  injector: CraftInjector | object,
): Promise<CraftProgramSettledStep> {
  return ɵcraftInjectorFromHost(injector).run(() =>
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
