import type { AnyCraftException, CraftServiceProvider } from '@craft-ng/core';
import { craftDirective } from './directive';
import {
  COMPONENT_OPERATOR,
  type ComponentExceptionHandler,
  type ComponentOperator,
  type ComponentInitializationExceptionsOf,
  type CraftComponent,
} from './types';
import type { CraftNodeChildren } from './render/vnode';

/** Adds a component-local provider scope to the component invocation. */
export function withProviders<
  const Providers extends readonly CraftServiceProvider[],
>(providers: Providers): ComponentOperator<Providers> {
  const operator = craftDirective(
    'withProviders',
    {},
    (baseLogic) => baseLogic,
    (baseTemplate) => baseTemplate,
    { providers },
  ) as unknown as ComponentOperator<Providers>;

  Object.defineProperty(operator, COMPONENT_OPERATOR, {
    value: { kind: 'providers', providers },
    enumerable: false,
  });

  return operator;
}

export type CatchTagHandlers<Codes extends string> = {
  readonly [Code in Codes]: (
    exception: AnyCraftException & { readonly code: Code },
  ) => CraftNodeChildren;
};

/** Component-template adapter for the core catchTag exhaustive algorithm. */
interface CatchTag {
  exhaustive<
    Codes extends string,
    const Handlers extends CatchTagHandlers<Codes> = CatchTagHandlers<Codes>,
  >(
    handlers: CatchTagHandlers<Codes> & Handlers,
  ): ComponentOperator<readonly [], Extract<keyof Handlers, string>>;
  exhaustive<
    Component extends CraftComponent<any>,
    const Handlers extends CatchTagHandlers<
      ComponentInitializationExceptionsOf<NoInfer<Component>>
    > = CatchTagHandlers<ComponentInitializationExceptionsOf<Component>>,
  >(
    component: Component,
    handlers: CatchTagHandlers<
      ComponentInitializationExceptionsOf<NoInfer<Component>>
    > &
      Handlers,
  ): ComponentOperator<readonly [], Extract<keyof Handlers, string>>;
}

function exhaustiveCatchTag<
  Codes extends string,
  const Handlers extends CatchTagHandlers<Codes>,
>(
  handlers: CatchTagHandlers<Codes> & Handlers,
): ComponentOperator<readonly [], Extract<keyof Handlers, string>>;
function exhaustiveCatchTag<
  Component extends CraftComponent<any>,
  const Handlers extends CatchTagHandlers<
    ComponentInitializationExceptionsOf<NoInfer<Component>>
  >,
>(
  component: Component,
  handlers: CatchTagHandlers<
    ComponentInitializationExceptionsOf<NoInfer<Component>>
  > &
    Handlers,
): ComponentOperator<readonly [], Extract<keyof Handlers, string>>;
function exhaustiveCatchTag(
  componentOrHandlers: CraftComponent<any> | CatchTagHandlers<string>,
  maybeHandlers?: CatchTagHandlers<string>,
) {
  return createCatchTagOperator(
    maybeHandlers ?? (componentOrHandlers as CatchTagHandlers<string>),
  );
}

export const catchTag: CatchTag = {
  exhaustive: exhaustiveCatchTag,
};

function createCatchTagOperator<
  Codes extends string,
  const Handlers extends CatchTagHandlers<Codes>,
>(handlers: CatchTagHandlers<Codes> & Handlers) {
  const operator = craftDirective(
    'catchTag.exhaustive',
    {},
    (baseLogic) => baseLogic,
    (baseTemplate) => baseTemplate,
    {
      catchHandlers: handlers as unknown as Record<
        string,
        ComponentExceptionHandler
      >,
    },
  ) as unknown as ComponentOperator<
    readonly [],
    Extract<keyof Handlers, string>
  >;

  Object.defineProperty(operator, COMPONENT_OPERATOR, {
    value: { kind: 'catchTag', catchHandlers: handlers },
    enumerable: false,
  });

  return operator;
}
