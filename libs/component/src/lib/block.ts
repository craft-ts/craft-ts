import type { AnyCraftException } from '@craft-ng/core';
import {
  CRAFT_DIRECTIVE,
  COMPONENT_CATCH_BLOCK,
  type ComponentOperator,
  type ComponentExceptionHandler,
  type ComponentExceptionHandlerDefinition,
  type ComponentExceptionHandlerEntry,
  type ComponentExceptionHandlerOptions,
  type CraftDirective,
} from './types';
import type { CraftNodeChildren } from './render/vnode';

export const CATCH_BLOCK_DIRECTIVE = Symbol('craft-catch-block-directive');

export type CatchBlockPosition = 'before' | 'after';

export class CraftUnhandledExceptionError extends Error {
  readonly code: string;

  constructor(exception: AnyCraftException) {
    super(
      `Unhandled Craft exception "${exception.code}" escaped every block boundary.`,
    );
    this.name = 'CraftUnhandledExceptionError';
    this.code = exception.code;
  }
}

export type CatchBlockHandler = ComponentExceptionHandler;
export type CatchBlockHandlerOptions = ComponentExceptionHandlerOptions;
export type CatchBlockHandlerDefinition = ComponentExceptionHandlerDefinition;
export type CatchBlockHandlerEntry = ComponentExceptionHandlerEntry;
export type CatchBlockHandlers = Record<string, CatchBlockHandlerEntry>;
export type CatchBlockHandlerChildren<Handler> =
  Handler extends ComponentExceptionHandlerEntry
    ? Handler extends (...args: any[]) => infer Children
      ? Children
      : Handler extends { readonly render: (...args: any[]) => infer Children }
        ? Children
        : never
    : never;

export function resolveCatchBlockHandler(
  handler: CatchBlockHandlerEntry,
  exception: AnyCraftException,
  defaultShowSource: boolean,
  defaultPosition: CatchBlockPosition,
): {
  readonly children: CraftNodeChildren;
  readonly showSource: boolean;
  readonly position: CatchBlockPosition;
} {
  if (typeof handler === 'function') {
    return {
      children: handler(exception),
      showSource: defaultShowSource,
      position: defaultPosition,
    };
  }

  return {
    children: handler.render(exception),
    showSource: handler.showSource ?? defaultShowSource,
    position: handler.position ?? defaultPosition,
  };
}

export type CatchBlockDirective<Handlers extends CatchBlockHandlers> =
  CraftDirective &
    ComponentOperator<readonly [], Extract<keyof Handlers, string>> & {
      readonly [COMPONENT_CATCH_BLOCK]: true;
      readonly [CATCH_BLOCK_DIRECTIVE]: {
        readonly handlers: Handlers;
        readonly position: CatchBlockPosition;
      };
    };

/** A template boundary which keeps its source block and inserts a fallback. */
export const catchBlock = {
  exhaustive<const Handlers extends CatchBlockHandlers>(
    handlers: Handlers,
    options: { readonly position?: CatchBlockPosition } = {},
  ): CatchBlockDirective<Handlers> {
    const position = options.position ?? 'after';
    const directive = (() =>
      undefined) as unknown as CatchBlockDirective<Handlers>;
    Object.defineProperty(directive, CRAFT_DIRECTIVE, {
      value: {
        name: 'catchBlock.exhaustive',
        meta: {},
        logic: (baseLogic: (...args: any[]) => any) => baseLogic,
        template: (baseTemplate: (context: any) => any) => baseTemplate,
        componentOperator: {
          kind: 'catchBlock',
          catchHandlers: handlers,
          catchBlockPosition: position,
        },
      },
      enumerable: false,
    });
    Object.defineProperty(directive, CATCH_BLOCK_DIRECTIVE, {
      value: { handlers, position },
      enumerable: false,
    });
    Object.defineProperty(directive, COMPONENT_CATCH_BLOCK, {
      value: true,
      enumerable: false,
    });
    return directive;
  },
};
