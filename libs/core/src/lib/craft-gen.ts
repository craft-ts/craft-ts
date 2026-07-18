import {
  isCraftException,
  type AnyCraftException,
  type ExtractCraftException,
  type StripCraftException,
} from './craft-exception';
import { isGenerator } from './craft-generator-runtime';

const CRAFT_GEN_EXCEPTION_MARKER = Symbol('craft-gen-exception-marker');
const CRAFT_GEN_SHORT_CIRCUIT = Symbol('craft-gen-short-circuit');
const CRAFT_PROGRAM_RECREATE = Symbol('craft-program-recreate');

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
export type ExtractCraftGenExceptions<Yielded> = [
  Extract<Yielded, CraftGenExceptionMarker<any>>,
] extends [never]
  ? never
  : Extract<
        Yielded,
        CraftGenExceptionMarker<any>
      > extends CraftGenExceptionMarker<infer Exception>
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

type CraftProgramGen<Yielded, Return> = Generator<Yielded, Return, unknown>;

/**
 * The `.pipe(...)` method carried by every craft program (a {@link craftGen}
 * invocation or the result of a previous `.pipe`). Applies program operators
 * left-to-right; each operator receives the piped generator and returns a new
 * one (see `CraftProgramOperator` in craft-program-operators). Arities are
 * explicit (1..7) to keep inference flat — no recursive conditional types.
 */
export interface CraftProgramPipe<Yielded, Return> {
  <Y1, R1>(
    op1: (program: CraftProgramGen<Yielded, Return>) => CraftProgramGen<Y1, R1>,
  ): CraftPipeableProgram<Y1, R1>;
  <Y1, R1, Y2, R2>(
    op1: (program: CraftProgramGen<Yielded, Return>) => CraftProgramGen<Y1, R1>,
    op2: (program: CraftProgramGen<Y1, R1>) => CraftProgramGen<Y2, R2>,
  ): CraftPipeableProgram<Y2, R2>;
  <Y1, R1, Y2, R2, Y3, R3>(
    op1: (program: CraftProgramGen<Yielded, Return>) => CraftProgramGen<Y1, R1>,
    op2: (program: CraftProgramGen<Y1, R1>) => CraftProgramGen<Y2, R2>,
    op3: (program: CraftProgramGen<Y2, R2>) => CraftProgramGen<Y3, R3>,
  ): CraftPipeableProgram<Y3, R3>;
  <Y1, R1, Y2, R2, Y3, R3, Y4, R4>(
    op1: (program: CraftProgramGen<Yielded, Return>) => CraftProgramGen<Y1, R1>,
    op2: (program: CraftProgramGen<Y1, R1>) => CraftProgramGen<Y2, R2>,
    op3: (program: CraftProgramGen<Y2, R2>) => CraftProgramGen<Y3, R3>,
    op4: (program: CraftProgramGen<Y3, R3>) => CraftProgramGen<Y4, R4>,
  ): CraftPipeableProgram<Y4, R4>;
  <Y1, R1, Y2, R2, Y3, R3, Y4, R4, Y5, R5>(
    op1: (program: CraftProgramGen<Yielded, Return>) => CraftProgramGen<Y1, R1>,
    op2: (program: CraftProgramGen<Y1, R1>) => CraftProgramGen<Y2, R2>,
    op3: (program: CraftProgramGen<Y2, R2>) => CraftProgramGen<Y3, R3>,
    op4: (program: CraftProgramGen<Y3, R3>) => CraftProgramGen<Y4, R4>,
    op5: (program: CraftProgramGen<Y4, R4>) => CraftProgramGen<Y5, R5>,
  ): CraftPipeableProgram<Y5, R5>;
  <Y1, R1, Y2, R2, Y3, R3, Y4, R4, Y5, R5, Y6, R6>(
    op1: (program: CraftProgramGen<Yielded, Return>) => CraftProgramGen<Y1, R1>,
    op2: (program: CraftProgramGen<Y1, R1>) => CraftProgramGen<Y2, R2>,
    op3: (program: CraftProgramGen<Y2, R2>) => CraftProgramGen<Y3, R3>,
    op4: (program: CraftProgramGen<Y3, R3>) => CraftProgramGen<Y4, R4>,
    op5: (program: CraftProgramGen<Y4, R4>) => CraftProgramGen<Y5, R5>,
    op6: (program: CraftProgramGen<Y5, R5>) => CraftProgramGen<Y6, R6>,
  ): CraftPipeableProgram<Y6, R6>;
  <Y1, R1, Y2, R2, Y3, R3, Y4, R4, Y5, R5, Y6, R6, Y7, R7>(
    op1: (program: CraftProgramGen<Yielded, Return>) => CraftProgramGen<Y1, R1>,
    op2: (program: CraftProgramGen<Y1, R1>) => CraftProgramGen<Y2, R2>,
    op3: (program: CraftProgramGen<Y2, R2>) => CraftProgramGen<Y3, R3>,
    op4: (program: CraftProgramGen<Y3, R3>) => CraftProgramGen<Y4, R4>,
    op5: (program: CraftProgramGen<Y4, R4>) => CraftProgramGen<Y5, R5>,
    op6: (program: CraftProgramGen<Y5, R5>) => CraftProgramGen<Y6, R6>,
    op7: (program: CraftProgramGen<Y6, R6>) => CraftProgramGen<Y7, R7>,
  ): CraftPipeableProgram<Y7, R7>;
}

/**
 * A craft program: a `yield*`-composable generator augmented with `.pipe(...)`.
 * `Yielded` already carries the program's {@link CraftGenExceptionMarker}s.
 */
export type CraftPipeableProgram<Yielded, Return> = Generator<
  Yielded,
  Return,
  unknown
> & {
  pipe: CraftProgramPipe<Yielded, Return>;
};

/**
 * The generator returned when a {@link craftGen} factory is invoked. Composable
 * with `yield*`: it relays the inner generator's dependency yields, advertises
 * the union of exceptions it may produce through a {@link CraftGenExceptionMarker},
 * and resolves to the success value (the output with exceptions stripped).
 * Program operators (`catchTag`, `retry`, …) compose through `.pipe(...)`.
 */
export type CraftGenInvocation<Yielded, Output> = CraftPipeableProgram<
  Yielded | CraftGenExceptionMarker<ExtractCraftException<Output>>,
  StripCraftException<Output>
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

type AnyProgramGen = Generator<unknown, unknown, unknown>;
type ProgramFactory = () => AnyProgramGen;
type AnyProgramOperator = (program: AnyProgramGen) => AnyProgramGen;

type RuntimeCraftProgram = AnyProgramGen & {
  [CRAFT_PROGRAM_RECREATE]: ProgramFactory;
  pipe: (...operators: AnyProgramOperator[]) => RuntimeCraftProgram;
};

/**
 * Returns the factory able to re-invoke `program` from scratch (a fresh
 * iterator over the same logic and arguments), or `undefined` for a bare
 * generator that was not built by {@link craftGen}/`.pipe`. Used by `retry` to
 * replay the whole upstream chain.
 */
export function ɵgetCraftProgramRecreate(
  program: AnyProgramGen,
): ProgramFactory | undefined {
  return (program as Partial<RuntimeCraftProgram>)[CRAFT_PROGRAM_RECREATE];
}

/**
 * Wraps a generator factory into a craft *program*: the generator (inert until
 * `next()`) augmented with `.pipe(...)` and an internal re-invocation marker.
 *
 * `.pipe` folds operators left-to-right; each stage is itself a program whose
 * re-invocation replays the entire upstream chain (`op(recreate-of-previous)`),
 * so `retry` placed anywhere in the chain can restart from the source without
 * the other operators having to know about re-invocation.
 */
export function ɵcreateCraftProgram(
  makeIterator: ProgramFactory,
): RuntimeCraftProgram {
  const program = Object.assign(makeIterator(), {
    [CRAFT_PROGRAM_RECREATE]: makeIterator,
    pipe(...operators: AnyProgramOperator[]): RuntimeCraftProgram {
      return operators.reduce<RuntimeCraftProgram>((previous, operator) => {
        const recreatePrevious = previous[CRAFT_PROGRAM_RECREATE];

        return ɵcreateCraftProgram(() =>
          operator(ɵcreateCraftProgram(recreatePrevious)),
        );
      }, program);
    },
  });

  return program;
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
  const invoker = (...args: GeneratorFactoryArgs<GenFn>) =>
    ɵcreateCraftProgram(function* () {
      const result = generatorFn(...args);
      const output: unknown = isGenerator(result) ? yield* result : result;

      if (isCraftException(output)) {
        throw new CraftGenShortCircuit(output);
      }

      return output;
    });

  return invoker as unknown as CraftGenInvoker<
    GeneratorFactoryArgs<GenFn>,
    GenFn
  >;
}
