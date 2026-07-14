import {
  isCraftException,
  type AnyCraftException,
  type ExtractCraftException,
  type StripCraftException,
} from './craft-exception';
import { isGenerator } from './craft-generator-runtime';

const CRAFT_GEN_EXCEPTION_MARKER = Symbol('craft-gen-exception-marker');
const CRAFT_GEN_SHORT_CIRCUIT = Symbol('craft-gen-short-circuit');

/**
 * Type-level marker surfaced by a {@link craftGen} invocation's `Yielded`. It
 * carries the union of {@link AnyCraftException} the generator may produce so a
 * composing generator (and a route's `canActivate`/`canMatch`) can read the
 * reachable exception codes off its `Yielded`.
 *
 * It is **never** yielded at runtime — the short-circuit is a native `throw` of
 * {@link CraftGenShortCircuit}. The marker is also intentionally NOT a
 * `ServiceYieldRequest`, so `ServiceDependencyMapFromYielded` / `RouteGuardDepsMap`
 * ignore it and route provider stripping is unaffected.
 */
export interface CraftGenExceptionMarker<Exception> {
  readonly [CRAFT_GEN_EXCEPTION_MARKER]: Exception;
}

/** Extracts the union of exceptions advertised by the markers in `Yielded`. */
export type ExtractCraftGenExceptions<Yielded> =
  Extract<Yielded, CraftGenExceptionMarker<any>> extends CraftGenExceptionMarker<
    infer Exception
  >
    ? Exception
    : never;

type AnyGeneratorFactory = (...args: any[]) => Generator<any, any, any>;

type GeneratorFactoryArgs<GenFn> = GenFn extends (
  ...args: infer Args
) => Generator<any, any, any>
  ? Args
  : never;

type GeneratorFactoryYielded<GenFn> = GenFn extends (
  ...args: any[]
) => Generator<infer Yielded, any, any>
  ? Yielded
  : never;

type GeneratorFactoryOutput<GenFn> = GenFn extends (
  ...args: any[]
) => Generator<any, infer Output, any>
  ? Output
  : never;

/**
 * The generator returned when a {@link craftGen} factory is invoked. Composable
 * with `yield*`: it relays the inner generator's dependency yields, advertises
 * the union of exceptions it may produce through a {@link CraftGenExceptionMarker},
 * and resolves to the success value (the output with exceptions stripped).
 */
export type CraftGenInvocation<Yielded, Output> = Generator<
  Yielded | CraftGenExceptionMarker<ExtractCraftException<Output>>,
  StripCraftException<Output>,
  unknown
>;

export type CraftGenInvoker<Args extends any[], GenFn> = (
  ...args: Args
) => CraftGenInvocation<
  GeneratorFactoryYielded<GenFn>,
  GeneratorFactoryOutput<GenFn>
>;

/**
 * Thrown to short-circuit the enclosing generator when a {@link craftGen}
 * invocation produces a `craftException`. The route chain driver catches it at
 * the guard/resolve boundary; composing generators simply let it propagate.
 */
export class CraftGenShortCircuit extends Error {
  readonly [CRAFT_GEN_SHORT_CIRCUIT] = true as const;

  constructor(readonly exception: AnyCraftException) {
    super(`craftGen short-circuited with exception "${exception.code}".`);
    this.name = 'CraftGenShortCircuit';
  }
}

export function isCraftGenShortCircuit(
  value: unknown,
): value is CraftGenShortCircuit {
  return (
    !!value &&
    typeof value === 'object' &&
    CRAFT_GEN_SHORT_CIRCUIT in value
  );
}

/**
 * Builds a reusable, parameterised generator factory.
 *
 * `craftGen(generatorFn)` returns a factory `(...args) => CraftGenInvocation`
 * that is composable with `yield*`. The inner generator's dependency yields
 * (`CraftAuthToYield`, `CraftRouterToYield`, …) flow up to the enclosing driver
 * unchanged, while the union of `craftException` it may return is tracked on the
 * invocation's `Yielded` (type-level only).
 *
 * When the inner generator returns a `craftException`, the invocation **throws**
 * {@link CraftGenShortCircuit}, interrupting the enclosing generator at any depth
 * and propagating the exception to the nearest boundary (typically a route's
 * `canActivate`/`canMatch` guard). When it returns a non-exception value, that
 * value is returned from the `yield*`.
 *
 * @example
 * ```ts
 * export const roleGuard = craftGen(function* (...roles: Role[]) {
 *   const { user } = yield* CraftAuthToYield(undefined, ({ user }) => ({ user }));
 *   if (!user()) return craftException({ code: 'NOT_AUTHENTICATED' });
 *   return roles.includes(user()!.role)
 *     ? true
 *     : craftException({ code: 'FORBIDDEN_ROLE' });
 * });
 * ```
 */
export function craftGen<GenFn extends AnyGeneratorFactory>(
  generatorFn: GenFn,
): CraftGenInvoker<GeneratorFactoryArgs<GenFn>, GenFn> {
  const invoker = function* (...args: GeneratorFactoryArgs<GenFn>) {
    const result = generatorFn(...args);
    const output: unknown = isGenerator(result) ? yield* result : result;

    if (isCraftException(output)) {
      throw new CraftGenShortCircuit(output);
    }

    return output;
  };

  return invoker as unknown as CraftGenInvoker<
    GeneratorFactoryArgs<GenFn>,
    GenFn
  >;
}
