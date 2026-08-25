import { CRAFT_DIRECTIVE, type CraftDirective } from './types';
import type { CraftNodeChildren } from './render/vnode';
import type { SsrMode } from '@craft-ts/core';

export const PENDING_NODE_DIRECTIVE = Symbol('craft-pending-node-directive');

/**
 * Where the fallback is inserted relative to the suspended subtree. The subtree
 * itself is kept mounted but **detached from the document** while it is
 * pending (its nodes live in a DocumentFragment — they are not `hidden` via
 * CSS), so its state survives the wait. Assistive tech is told via
 * `aria-busy` / `aria-live` on the fallback, not via the detached source.
 */
export type PendingPosition = 'before' | 'after';

export type PendingFallback = () => CraftNodeChildren;

/**
 * What to render for one source. A bare function covers the suspended case; the
 * object form adds `reloading`, rendered **next to the still-visible subtree**
 * when the source already has a value and is refetching.
 */
export type PendingHandler =
  | PendingFallback
  | {
      readonly pending: PendingFallback;
      readonly reloading?: PendingFallback;
    };

/** One handler per async source name, for the `.exhaustive` form. */
export type PendingHandlers = Readonly<
  Record<string, PendingHandler>
>;

type HandlerChildrenOf<Handler> = Handler extends () => infer Children
  ? Children
  : Handler extends {
        readonly pending: () => infer Pending;
        readonly reloading?: () => infer Reloading;
      }
    ? Pending | Reloading
    : never;

export type PendingHandlerChildren<Handler> = HandlerChildrenOf<Handler>;

/** Resolves the children a handler renders for one of its two states. */
export function resolvePendingHandler(
  handler: PendingHandler,
  state: 'pending' | 'reloading',
): CraftNodeChildren {
  if (typeof handler === 'function') {
    return state === 'pending' ? handler() : [];
  }

  return state === 'pending'
    ? handler.pending()
    : (handler.reloading?.() ?? []);
}

/**
 * Thrown when a `CraftNotSettled` escapes every `pendingNode` boundary — the
 * runtime counterpart of the compile-time check, for the cases the types cannot
 * see (a settled read hidden inside a lambda, a dynamically built subtree).
 */
export class CraftUnhandledPendingError extends Error {
  readonly source: string;

  constructor(source: string) {
    super(
      `Craft async source "${source}" suspended outside of any pendingNode(...) boundary.`,
    );
    this.name = 'CraftUnhandledPendingError';
    this.source = source;
  }
}

export type PendingDirective<
  Handlers extends PendingHandlers | undefined = undefined,
  FallbackChildren extends CraftNodeChildren = CraftNodeChildren,
> = CraftDirective & {
  readonly [PENDING_NODE_DIRECTIVE]: {
    /** `undefined` for the catch-all form: every source below is covered. */
    readonly handlers: Handlers;
    readonly fallback: PendingFallback | undefined;
    readonly reloading: PendingFallback | undefined;
    readonly position: PendingPosition;
    readonly ssr: SsrMode | undefined;
    /** Phantom carrier — the fallback's own nodes, never read at runtime. */
    readonly fallbackChildren?: FallbackChildren;
  };
};

/**
 * The sources a `pendingNode` leaves uncovered. The catch-all form covers
 * everything below it; the `.exhaustive` form covers only the sources it names.
 */
export type PendingResidualSources<
  Sources extends string,
  Handlers extends PendingHandlers | undefined,
> = Handlers extends PendingHandlers
  ? Exclude<Sources, Extract<keyof Handlers, string>>
  : never;

/** Exhaustiveness check for `pendingNode.exhaustive({...})`. */
export type PendingExhaustiveCheck<
  Sources extends string,
  Handlers extends PendingHandlers,
> = [Exclude<Sources, Extract<keyof Handlers, string>>] extends [never]
  ? [Exclude<Extract<keyof Handlers, string>, Sources>] extends [never]
    ? unknown
    : {
        'pendingNode.exhaustive has fallbacks for sources that never suspend here': Exclude<
          Extract<keyof Handlers, string>,
          Sources
        >;
      }
  : {
      'pendingNode.exhaustive is missing a fallback for async sources': Exclude<
        Sources,
        Extract<keyof Handlers, string>
      >;
    };

function createPendingDirective<
  Handlers extends PendingHandlers | undefined,
>(
  handlers: Handlers,
  fallback: PendingFallback | undefined,
  reloading: PendingFallback | undefined,
  position: PendingPosition,
  ssr: SsrMode | undefined,
): PendingDirective<Handlers> {
  const directive = (() =>
    undefined) as unknown as PendingDirective<Handlers>;

  Object.defineProperty(directive, CRAFT_DIRECTIVE, {
    value: {
      name: handlers ? 'pendingNode.exhaustive' : 'pendingNode',
      meta: {},
      logic: (baseLogic: (...args: any[]) => any) => baseLogic,
      template: (baseTemplate: (context: any) => any) => baseTemplate,
    },
    enumerable: false,
  });
  Object.defineProperty(directive, PENDING_NODE_DIRECTIVE, {
    value: { handlers, fallback, reloading, position, ssr },
    enumerable: false,
  });

  return directive;
}

type PendingBaseOptions<
  Fallback extends PendingFallback = PendingFallback,
> = Readonly<{
  /**
   * Rendered next to the still-visible subtree while a source that already has
   * a value is refetching. A refetch does not suspend — the stale value stays
   * on screen — so this is how the boundary reports it.
   */
  readonly reloading?: Fallback;
  /** Where the fallback goes relative to the (hidden) subtree. Defaults to `'before'`. */
  readonly position?: PendingPosition;
}>;

/**
 * A client-only SSR boundary must name the shell that replaces the skipped
 * subtree. Other modes may omit it when an exhaustive handler or an outer
 * boundary owns the pending UI.
 */
export type PendingOptions<
  Fallback extends PendingFallback = PendingFallback,
> = PendingBaseOptions<Fallback> &
  (
    | Readonly<{
        readonly ssr: 'client';
        readonly fallback: Fallback;
      }>
    | Readonly<{
        readonly ssr?: Exclude<SsrMode, 'client'>;
        /** Rendered while the subtree has an async source with no value yet. */
        readonly fallback?: Fallback;
      }>
  );

interface PendingFactory {
  /**
   * A boundary that renders `fallback` while **any** async source read below it
   * has no value yet — the template equivalent of Solid's `Suspense`.
   *
   * ```ts
   * div([span(users.settledValue)]).pipe(
   *   pendingNode({ fallback: () => span('Chargement…') }),
   * )
   * ```
   *
   * The suspended subtree stays mounted (detached from the document, not
   * CSS-hidden) so nothing below it is torn down and rebuilt when the data
   * arrives. The fallback is announced with `aria-live="polite"`.
   */
  <Fallback extends PendingFallback>(
    options?: PendingOptions<Fallback>,
  ): PendingDirective<
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
   *   pendingNode.exhaustive({
   *     users: () => SkeletonList(),
   *     orders: () => SkeletonRows(),
   *   }),
   * )
   * ```
   *
   * When several listed sources are pending at once, the fallback of the first
   * one to suspend is rendered.
   */
  exhaustive<const Handlers extends PendingHandlers>(
    handlers: Handlers,
    options?: Omit<PendingOptions, 'fallback' | 'reloading'>,
  ): PendingDirective<
    Handlers,
    PendingHandlerChildren<
      Handlers[keyof Handlers]
    > extends CraftNodeChildren
      ? PendingHandlerChildren<Handlers[keyof Handlers]>
      : CraftNodeChildren
  >;
}

export const pendingNode: PendingFactory = Object.assign(
  (options: PendingOptions = {}) =>
    createPendingDirective(
      undefined,
      options.fallback,
      options.reloading,
      options.position ?? 'before',
      options.ssr,
    ),
  {
    exhaustive: (
      handlers: PendingHandlers,
      options: Omit<PendingOptions, 'fallback' | 'reloading'> = {},
    ) =>
      createPendingDirective(
        handlers,
        undefined,
        undefined,
        options.position ?? 'before',
        options.ssr,
      ),
  },
) as PendingFactory;

export function isPendingDirective(
  value: unknown,
): value is PendingDirective<PendingHandlers | undefined> {
  return (
    typeof value === 'function' && PENDING_NODE_DIRECTIVE in (value as object)
  );
}
