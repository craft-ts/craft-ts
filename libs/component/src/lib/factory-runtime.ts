import {
  executeGeneratorCompatibleFactoryAsync,
  isGenerator,
  ɵexecuteFactoryIn,
  type FnFactoryAdapter,
  type CraftInjector,
  type CraftProgramSettledStep,
  type ResolveGeneratorResult,
} from '@craft-ts/core';
import type {
  ComponentDefinition,
  ComponentFactory,
  ComponentMeta,
} from './types';
import type { CraftNodeChildren } from './render/vnode';
import { applyHostPropsToChildren, mergeHostProps } from './render/vnode';
import type { HostProps } from './hyperscript';

const INVALID_YIELD =
  'craftComponent() templates can only yield craftService dependencies.';
const MULTIPLE_APP_START =
  'craftComponent() templates cannot declare onAppStart(...) more than once.';
const APP_START_NOT_SUPPORTED =
  'craftComponent() does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.';

export function executeCraftComponentFactory<Factory extends ComponentFactory>(
  factory: Factory,
  args: Parameters<Factory>,
  injector: CraftInjector,
  onServiceResolved?: (instance: unknown) => void,
  /** `injectFnWrapper()` in `injector`, when the renderer already has it. */
  fnAdapter?: FnFactoryAdapter,
): ResolveGeneratorResult<ReturnType<Factory>> {
  return injector.run(
    () =>
      ɵexecuteFactoryIn(
        factory as (...args: unknown[]) => unknown,
        undefined,
        args as unknown[],
        injector,
        COMPONENT_FACTORY_MESSAGES,
        fnAdapter,
        onServiceResolved,
      ) as ResolveGeneratorResult<ReturnType<Factory>>,
  );
}

const NO_HOST_PROPS: Readonly<Record<string, unknown>> = Object.freeze({});

const COMPONENT_FACTORY_MESSAGES = {
  invalidYieldErrorMessage: INVALID_YIELD,
  multipleAppStartErrorMessage: MULTIPLE_APP_START,
  onAppStartNotSupportedErrorMessage: APP_START_NOT_SUPPORTED,
};

export function executeCraftComponentFactoryAsync<
  Factory extends ComponentFactory,
>(
  factory: Factory,
  args: Parameters<Factory>,
  injector: CraftInjector,
): Promise<CraftProgramSettledStep> {
  return injector.run(() =>
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

/**
 * Hands a directive a base template it can always delegate to with `yield*`,
 * whatever shape the template underneath has.
 */
export function ɵasGeneratorTemplate(
  template: ComponentFactory,
): ComponentFactory {
  return function* (...args: unknown[]) {
    const result = (template as (...args: unknown[]) => unknown)(...args);
    return isGenerator(result) ? yield* result : result;
  } as ComponentFactory;
}

/**
 * Renders a component: drives its template in the component's own injector and
 * settles the host props on what came out.
 *
 * A directive that wraps a template may hand back its base generator instead of
 * delegating to it, so anything still generator-shaped is driven again rather
 * than rendered as a child.
 */
export function renderCraftComponentTemplate(
  definition: Pick<ComponentDefinition, 'template'> & {
    readonly meta: ComponentMeta;
  },
  args: readonly unknown[],
  hostProps: HostProps | undefined,
  injector: CraftInjector,
  onServiceResolved?: (instance: unknown) => void,
  fnAdapter?: FnFactoryAdapter,
): CraftNodeChildren {
  let children: unknown = executeCraftComponentFactory(
    definition.template as ComponentFactory,
    args as Parameters<ComponentFactory>,
    injector,
    onServiceResolved,
    fnAdapter,
  );

  while (isGenerator(children)) {
    const pending = children;
    children = executeCraftComponentFactory(
      (() => pending) as ComponentFactory,
      [] as Parameters<ComponentFactory>,
      injector,
      onServiceResolved,
      fnAdapter,
    );
  }

  const rendered = children as CraftNodeChildren;
  const effectiveHostProps = mergeHostProps(
    definition.meta.host ?? NO_HOST_PROPS,
    hostProps ?? NO_HOST_PROPS,
  );
  return applyHostPropsToChildren(rendered, effectiveHostProps);
}
