import type { AnyCraftException } from '@craft-ts/core';
import {
  CRAFT_DIRECTIVE,
  COMPONENT_CATCH_NODE,
  type ComponentOperator,
  type ComponentExceptionHandler,
  type ComponentExceptionHandlerDefinition,
  type ComponentExceptionHandlerEntry,
  type ComponentExceptionHandlerOptions,
  type CraftDirective,
} from './types';
import type { CraftNodeChildren } from './render/vnode';

export const CATCH_NODE_DIRECTIVE = Symbol('craft-catch-node-directive');

export type CatchPosition = 'before' | 'after';

export class CraftUnhandledExceptionError extends Error {
  readonly _tag: string;

  constructor(exception: AnyCraftException) {
    super(
      `Unhandled Craft exception "${exception._tag}" escaped every block boundary.`,
    );
    this.name = 'CraftUnhandledExceptionError';
    this._tag = exception._tag;
  }
}

export type CatchHandler = ComponentExceptionHandler;
export type CatchHandlerOptions = ComponentExceptionHandlerOptions;
export type CatchHandlerDefinition = ComponentExceptionHandlerDefinition;
export type CatchHandlerEntry = ComponentExceptionHandlerEntry;
export type CatchHandlers = Record<string, CatchHandlerEntry>;
export type CatchHandlerChildren<Handler> =
  Handler extends ComponentExceptionHandlerEntry
    ? Handler extends (...args: any[]) => infer Children
      ? Children
      : Handler extends { readonly render: (...args: any[]) => infer Children }
        ? Children
        : never
    : never;

export function resolveCatchHandler(
  handler: CatchHandlerEntry,
  exception: AnyCraftException,
  defaultShowSource: boolean,
  defaultPosition: CatchPosition,
): {
  readonly children: CraftNodeChildren;
  readonly showSource: boolean;
  readonly position: CatchPosition;
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

export type CatchDirective<Handlers extends CatchHandlers> =
  CraftDirective &
    ComponentOperator<readonly [], Extract<keyof Handlers, string>> & {
      readonly [COMPONENT_CATCH_NODE]: true;
      readonly [CATCH_NODE_DIRECTIVE]: {
        readonly handlers: Handlers;
        readonly position: CatchPosition;
      };
    };

/** A template boundary which keeps its source block and inserts a fallback. */
export const catchNode = {
  exhaustive<const Handlers extends CatchHandlers>(
    handlers: Handlers,
    options: { readonly position?: CatchPosition } = {},
  ): CatchDirective<Handlers> {
    const position = options.position ?? 'after';
    const directive = (() =>
      undefined) as unknown as CatchDirective<Handlers>;
    Object.defineProperty(directive, CRAFT_DIRECTIVE, {
      value: {
        name: 'catchNode.exhaustive',
        meta: {},
        logic: (baseLogic: (...args: any[]) => any) => baseLogic,
        template: (baseTemplate: (context: any) => any) => baseTemplate,
        componentOperator: {
          kind: 'catchNode',
          catchHandlers: handlers,
          catchNodePosition: position,
        },
      },
      enumerable: false,
    });
    Object.defineProperty(directive, CATCH_NODE_DIRECTIVE, {
      value: { handlers, position },
      enumerable: false,
    });
    Object.defineProperty(directive, COMPONENT_CATCH_NODE, {
      value: true,
      enumerable: false,
    });
    return directive;
  },
};
