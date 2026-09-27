import {
  executeGeneratorCompatibleFactory,
  executeGeneratorCompatibleFactoryAsync,
  isGenerator,
  type CraftInjector,
  type CraftProgramSettledStep,
  type ResolveGeneratorResult,
  ɵcraftInjectorFromHost,
} from '@craft-ts/core';
import type {
  ComponentDefinition,
  ComponentFactory,
  ComponentMeta,
} from './types';
import type { CraftNodeChildren } from './render/vnode';
import { applyHostPropsToChildren, mergeHostProps } from './render/vnode';
import { forwardedCssVarStyles } from './css-vars';
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
  injector: CraftInjector | object,
  onServiceResolved?: (instance: unknown) => void,
): ResolveGeneratorResult<ReturnType<Factory>> {
  return ɵcraftInjectorFromHost(injector).run(
    () =>
      executeGeneratorCompatibleFactory({
        factory,
        thisArg: undefined,
        getInjector: () => ɵcraftInjectorFromHost(injector),
        args,
        invalidYieldErrorMessage: INVALID_YIELD,
        multipleAppStartErrorMessage: MULTIPLE_APP_START,
        onAppStartNotSupportedErrorMessage: APP_START_NOT_SUPPORTED,
        onServiceResolved,
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
      getInjector: () => ɵcraftInjectorFromHost(injector),
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
  injector: CraftInjector | object,
  onServiceResolved?: (instance: unknown) => void,
): CraftNodeChildren {
  let children: unknown = executeCraftComponentFactory(
    definition.template as ComponentFactory,
    args as Parameters<ComponentFactory>,
    injector,
    onServiceResolved,
  );

  while (isGenerator(children)) {
    const pending = children;
    children = executeCraftComponentFactory(
      (() => pending) as ComponentFactory,
      [] as Parameters<ComponentFactory>,
      injector,
      onServiceResolved,
    );
  }

  const rendered = children as CraftNodeChildren;
  const forwardedStyles = forwardedCssVarStyles(rendered);
  const withForwardedDefaults = mergeHostProps(definition.meta.host ?? {}, {
    style: forwardedStyles,
  });
  const effectiveHostProps = mergeHostProps(
    withForwardedDefaults,
    hostProps ?? {},
  );
  return applyHostPropsToChildren(rendered, effectiveHostProps);
}
