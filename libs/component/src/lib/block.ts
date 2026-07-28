import type { AnyCraftException } from '@craft-ng/core';
import { CRAFT_DIRECTIVE, type CraftDirective } from './types';
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

export type CatchBlockHandler = (
  exception: AnyCraftException,
) => CraftNodeChildren;

export type CatchBlockHandlers = Record<string, CatchBlockHandler>;

export type CatchBlockDirective<Handlers extends CatchBlockHandlers> =
  CraftDirective & {
    readonly [CATCH_BLOCK_DIRECTIVE]: {
      readonly handlers: Handlers;
      readonly position: CatchBlockPosition;
    };
  };

/** A template boundary which keeps its source block and inserts a fallback. */
export const catchBlock = {
  exhaustive<const Handlers extends CatchBlockHandlers>(
    handlers: Handlers,
    options: { readonly position: CatchBlockPosition },
  ): CatchBlockDirective<Handlers> {
    const directive = (() =>
      undefined) as unknown as CatchBlockDirective<Handlers>;
    Object.defineProperty(directive, CRAFT_DIRECTIVE, {
      value: {
        name: 'catchBlock.exhaustive',
        meta: {},
        logic: (baseLogic: (...args: any[]) => any) => baseLogic,
        template: (baseTemplate: (context: any) => any) => baseTemplate,
      },
      enumerable: false,
    });
    Object.defineProperty(directive, CATCH_BLOCK_DIRECTIVE, {
      value: { handlers, position: options.position },
      enumerable: false,
    });
    return directive;
  },
};
