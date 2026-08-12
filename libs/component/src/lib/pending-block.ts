import { CRAFT_DIRECTIVE, type CraftDirective } from './types';
import type { CraftNodeChildren } from './render/vnode';

export const PENDING_BLOCK_DIRECTIVE = Symbol('craft-pending-block-directive');

/**
 * Where the fallback is inserted relative to the suspended subtree. The subtree
 * itself is kept mounted but hidden while it is pending, so its state (and the
 * state of the components inside it) survives the wait.
 */
export type PendingBlockPosition = 'before' | 'after';

export type PendingFallback = () => CraftNodeChildren;

/** One fallback per async source name, for the `.exhaustive` form. */
export type PendingBlockHandlers = Readonly<Record<string, PendingFallback>>;

export type PendingBlockHandlerChildren<Handler> = Handler extends () => infer Children
  ? Children
  : never;

/**
 * Thrown when a `CraftNotSettled` escapes every `pendingBlock` boundary — the
 * runtime counterpart of the compile-time check, for the cases the types cannot
 * see (a settled read hidden inside a lambda, a dynamically built subtree).
 */
export class CraftUnhandledPendingError extends Error {
  readonly source: string;

  constructor(source: string) {
    super(
      `Craft async source "${source}" suspended outside of any pendingBlock(...) boundary.`,
    );
    this.name = 'CraftUnhandledPendingError';
    this.source = source;
  }
}

export type PendingBlockDirective<
  Handlers extends PendingBlockHandlers | undefined = undefined,
  FallbackChildren extends CraftNodeChildren = CraftNodeChildren,
> = CraftDirective & {
  readonly [PENDING_BLOCK_DIRECTIVE]: {
    /** `undefined` for the catch-all form: every source below is covered. */
    readonly handlers: Handlers;
    readonly fallback: PendingFallback | undefined;
    readonly position: PendingBlockPosition;
    /** Phantom carrier — the fallback's own nodes, never read at runtime. */
    readonly fallbackChildren?: FallbackChildren;
  };
};

/**
 * The sources a `pendingBlock` leaves uncovered. The catch-all form covers
 * everything below it; the `.exhaustive` form covers only the sources it names.
 */
export type PendingBlockResidualSources<
  Sources extends string,
  Handlers extends PendingBlockHandlers | undefined,
> = Handlers extends PendingBlockHandlers
  ? Exclude<Sources, Extract<keyof Handlers, string>>
  : never;

/** Exhaustiveness check for `pendingBlock.exhaustive({...})`. */
export type PendingBlockExhaustiveCheck<
  Sources extends string,
  Handlers extends PendingBlockHandlers,
> = [Exclude<Sources, Extract<keyof Handlers, string>>] extends [never]
  ? [Exclude<Extract<keyof Handlers, string>, Sources>] extends [never]
    ? unknown
    : {
        'pendingBlock.exhaustive has fallbacks for sources that never suspend here': Exclude<
          Extract<keyof Handlers, string>,
          Sources
        >;
      }
  : {
      'pendingBlock.exhaustive is missing a fallback for async sources': Exclude<
        Sources,
        Extract<keyof Handlers, string>
      >;
    };

function createPendingBlockDirective<
  Handlers extends PendingBlockHandlers | undefined,
>(
  handlers: Handlers,
  fallback: PendingFallback | undefined,
  position: PendingBlockPosition,
): PendingBlockDirective<Handlers> {
  const directive = (() =>
    undefined) as unknown as PendingBlockDirective<Handlers>;

  Object.defineProperty(directive, CRAFT_DIRECTIVE, {
    value: {
      name: handlers ? 'pendingBlock.exhaustive' : 'pendingBlock',
      meta: {},
      logic: (baseLogic: (...args: any[]) => any) => baseLogic,
      template: (baseTemplate: (context: any) => any) => baseTemplate,
    },
    enumerable: false,
  });
  Object.defineProperty(directive, PENDING_BLOCK_DIRECTIVE, {
    value: { handlers, fallback, position },
    enumerable: false,
  });

  return directive;
}

export interface PendingBlockOptions<
  Fallback extends PendingFallback = PendingFallback,
> {
  /** Rendered while the subtree below has an async source with no value yet. */
  readonly fallback?: Fallback;
  /** Where the fallback goes relative to the (hidden) subtree. Defaults to `'before'`. */
  readonly position?: PendingBlockPosition;
}

interface PendingBlockFactory {
  /**
   * A boundary that renders `fallback` while **any** async source read below it
   * has no value yet — the template equivalent of Solid's `Suspense`.
   *
   * ```ts
   * div([span(users.settledValue)]).pipe(
   *   pendingBlock({ fallback: () => span('Chargement…') }),
   * )
   * ```
   *
   * The suspended subtree stays mounted (hidden) so nothing below it is torn
   * down and rebuilt when the data arrives.
   */
  <Fallback extends PendingFallback>(
    options?: PendingBlockOptions<Fallback>,
  ): PendingBlockDirective<
    undefined,
    ReturnType<Fallback> extends CraftNodeChildren
      ? ReturnType<Fallback>
      : CraftNodeChildren
  >;

  /**
   * A boundary with one fallback per async source, checked exhaustively against
   * the sources actually read below it — an unlisted source is a compile error,
   * and so is a fallback for a source that never suspends here.
   *
   * ```ts
   * div([...]).pipe(
   *   pendingBlock.exhaustive({
   *     users: () => SkeletonList(),
   *     orders: () => SkeletonRows(),
   *   }),
   * )
   * ```
   *
   * When several listed sources are pending at once, the fallback of the first
   * one to suspend is rendered.
   */
  exhaustive<const Handlers extends PendingBlockHandlers>(
    handlers: Handlers,
    options?: Omit<PendingBlockOptions, 'fallback'>,
  ): PendingBlockDirective<
    Handlers,
    PendingBlockHandlerChildren<Handlers[keyof Handlers]> extends CraftNodeChildren
      ? PendingBlockHandlerChildren<Handlers[keyof Handlers]>
      : CraftNodeChildren
  >;
}

export const pendingBlock: PendingBlockFactory = Object.assign(
  (options: PendingBlockOptions = {}) =>
    createPendingBlockDirective(
      undefined,
      options.fallback,
      options.position ?? 'before',
    ),
  {
    exhaustive: (
      handlers: PendingBlockHandlers,
      options: Omit<PendingBlockOptions, 'fallback'> = {},
    ) =>
      createPendingBlockDirective(
        handlers,
        undefined,
        options.position ?? 'before',
      ),
  },
) as PendingBlockFactory;

export function isPendingBlockDirective(
  value: unknown,
): value is PendingBlockDirective<PendingBlockHandlers | undefined> {
  return (
    typeof value === 'function' &&
    PENDING_BLOCK_DIRECTIVE in (value as object)
  );
}
