import type { AnyCraftException, CraftServiceProvider } from '@craft-ng/core';
import { craftDirective } from './directive';
import {
  COMPONENT_OPERATOR,
  type ComponentExceptionHandler,
  type ComponentOperator,
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

type ComponentHandlers = Record<
  string,
  (exception: AnyCraftException) => CraftNodeChildren
>;

/** Component-template adapter for the core catchTag exhaustive algorithm. */
export const catchTag = {
  exhaustive<const Handlers extends ComponentHandlers>(
    handlers: Handlers,
  ): ComponentOperator<readonly [], Extract<keyof Handlers, string>> {
    const operator = craftDirective(
      'catchTag.exhaustive',
      {},
      (baseLogic) => baseLogic,
      (baseTemplate) => baseTemplate,
      { catchHandlers: handlers as Record<string, ComponentExceptionHandler> },
    ) as unknown as ComponentOperator<
      readonly [],
      Extract<keyof Handlers, string>
    >;

    Object.defineProperty(operator, COMPONENT_OPERATOR, {
      value: { kind: 'catchTag', catchHandlers: handlers },
      enumerable: false,
    });

    return operator;
  },
};
