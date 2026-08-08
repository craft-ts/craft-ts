import {
  isCraftException,
  type AnyCraftException,
  type ExcludeByCode,
  type ExtractCraftException,
  type StripCraftException,
} from './craft-exception';
import {
  CraftGenShortCircuit,
  isCraftGenShortCircuit,
  ɵgetCraftProgramRecreate,
  type CraftGenExceptionMarker,
  type ExtractCraftGenExceptions,
} from './craft-gen';
import {
  createTemporalSleepRequest,
  exponentialTemporalSchedule,
  type CraftTemporalSchedule,
  type RuntimeTemporalAwaitRequest,
} from './temporal-runtime';
import {
  GUARD_AWAIT_REQUEST_MARKER,
  isGenerator,
  type RuntimeGuardAwaitRequest,
} from './craft-generator-runtime';

// ---------------------------------------------------------------------------
// Program operators, composed through a craft program's `.pipe(...)`:
//
// ```ts
// const user = yield* loadUser(id).pipe(
//   catchTag('NOT_FOUND', function* () { return GUEST; }),
//   retry({ times: 3, backoff: 'exponential', delayMs: 200 }),
// );
// ```
//
// The exception union `E` of a program travels exclusively at the type level
// (the `CraftGenExceptionMarker` in its `Yielded`); at runtime an exception is
// a thrown `CraftGenShortCircuit`, so operators are plain generator wrappers
// and no driver has to know about them.
//
// Operators are written *generator-first*: the factory (`catchTag(...)`)
// captures only its own inputs and returns a **generic** operator, so the
// program's `Yielded`/`Return` are inferred at the `.pipe` application site.
// ---------------------------------------------------------------------------

/**
 * A program operator: takes the piped program and returns the derived one.
 * `YIn`/`AIn` are the source program's yields (markers included) and success
 * value; `YOut`/`AOut` the derived program's. Use it to type custom operators:
 *
 * ```ts
 * const swallowAll: CraftProgramOperator<Y, A, Y, A | undefined> = (program) => ...
 * ```
 */
export type CraftProgramOperator<YIn, AIn, YOut, AOut> = (
  program: Generator<YIn, AIn, unknown>,
) => Generator<YOut, AOut, unknown>;

/** `Yielded` with the phantom exception markers removed (real runtime yields). */
type StripGenExceptionMarkers<Yielded> = Exclude<
  Yielded,
  CraftGenExceptionMarker<any>
>;

/** Rebuilds a marker for `Exception`, or `never` when nothing remains to advertise. */
type MarkerFor<Exception> = [Exception] extends [never]
  ? never
  : CraftGenExceptionMarker<Exception>;

type HandlerGen = (exception: any) => Generator<any, any, unknown>;

type HandlerYielded<Handler> = Handler extends (
  ...args: any[]
) => Generator<infer Yielded, any, any>
  ? Yielded
  : never;

type HandlerOutput<Handler> = Handler extends (
  ...args: any[]
) => Generator<any, infer Output, any>
  ? Output
  : never;

/** The exceptions a handler may itself produce (nested programs + returned exceptions). */
type HandlerExceptions<HYielded, HOutput> = Extract<
  ExtractCraftGenExceptions<HYielded> | ExtractCraftException<HOutput>,
  AnyCraftException
>;

const RETRY_REQUIRES_PROGRAM_ERROR_MESSAGE =
  'retry(...) needs a re-invocable craft program (a craftGen invocation or a .pipe stage); a bare generator cannot be replayed.';

function runHandlerOutput(output: unknown): unknown {
  if (isCraftException(output)) {
    // A handler that resolves to a `craftException` re-enters the exception
    // channel (mirrors craftGen's own return contract).
    throw new CraftGenShortCircuit(output);
  }

  return output;
}

function* catchWithLookup(
  program: Generator<unknown, unknown, unknown>,
  lookupHandler: (code: string) => HandlerGen | undefined,
): Generator<unknown, unknown, unknown> {
  try {
    return yield* program;
  } catch (error) {
    if (!isCraftGenShortCircuit(error)) {
      throw error;
    }

    const handler = lookupHandler(error.exception.code);

    if (!handler) {
      throw error;
    }

    const result = handler(error.exception);
    const output: unknown = isGenerator(result) ? yield* result : result;

    return runHandlerOutput(output);
  }
}

/**
 * Compile-time exhaustiveness of a `catchTag.exhaustive` map, checked at the
 * `.pipe` application site (the program's exception union is only known
 * there): every reachable code needs a handler, and no handler may target an
 * unreachable code. On violation the operator's program parameter collapses to
 * an impossible intersection whose property name spells out the problem.
 */
/**
 * Shared exact-code check used by program and component catchTag adapters.
 *
 * The handler value is intentionally not part of this type: each consumer
 * has a different handler contract (generators for programs, template
 * children for components), but the reachable-code rules are identical.
 */
export type CatchTagExhaustiveCodesCheck<
  Codes extends PropertyKey,
  Handlers,
> = [Exclude<Codes, keyof Handlers>] extends [never]
  ? [Exclude<keyof Handlers, Codes>] extends [never]
    ? unknown
    : {
        'catchTag.exhaustive has handlers for unreachable codes': Exclude<
          keyof Handlers,
          Codes
        >;
      }
  : {
      'catchTag.exhaustive is missing handlers for codes': Exclude<
        Codes,
        keyof Handlers
      >;
    };

export type CatchTagExhaustiveHandlersCheck<
  Exception extends AnyCraftException,
  Handlers,
> = CatchTagExhaustiveCodesCheck<Exception['code'], Handlers>;

type ExhaustiveHandlersYielded<Handlers> = {
  [K in keyof Handlers]: HandlerYielded<Handlers[K]>;
}[keyof Handlers];

type ExhaustiveHandlersOutput<Handlers> = {
  [K in keyof Handlers]: HandlerOutput<Handlers[K]>;
}[keyof Handlers];

type ExhaustiveHandlersExceptions<Handlers> = {
  [K in keyof Handlers]: HandlerExceptions<
    HandlerYielded<Handlers[K]>,
    HandlerOutput<Handlers[K]>
  >;
}[keyof Handlers];

interface CatchTagOperator {
  /**
   * Catches the program's `craftException` of `code`: the handler generator
   * runs in its place (its yields — craft services, nested programs,
   * `craftUntilSettled` — are relayed to the driver, so its dependencies stay
   * tracked) and its success value widens the program's. `code` is removed
   * from the program's exception union; exceptions the handler itself
   * produces are added to it.
   */
  <const Code extends string, HYielded, HOutput>(
    code: Code,
    handler: (
      exception: AnyCraftException & { code: Code },
    ) => Generator<HYielded, HOutput, unknown>,
  ): <YIn, AIn>(
    program: Generator<YIn, AIn, unknown>,
  ) => Generator<
    | StripGenExceptionMarkers<YIn>
    | StripGenExceptionMarkers<HYielded>
    | MarkerFor<
        | Extract<
            ExcludeByCode<ExtractCraftGenExceptions<YIn>, Code>,
            AnyCraftException
          >
        | HandlerExceptions<HYielded, HOutput>
      >,
    AIn | StripCraftException<HOutput>,
    unknown
  >;

  /**
   * Catches **every** reachable `craftException` of the program through a
   * handler map covering exactly its exception union — a missing code or a
   * handler for an unreachable code is a compile error at the `.pipe`
   * application site. Afterwards the program's exception union is `never`
   * (plus whatever the handlers themselves may produce).
   */
  exhaustive: <Handlers extends Record<string, HandlerGen>>(
    handlers: Handlers,
  ) => <YIn, AIn>(
    program: Generator<YIn, AIn, unknown> &
      CatchTagExhaustiveHandlersCheck<
        Extract<ExtractCraftGenExceptions<YIn>, AnyCraftException>,
        Handlers
      >,
  ) => Generator<
    | StripGenExceptionMarkers<YIn>
    | StripGenExceptionMarkers<ExhaustiveHandlersYielded<Handlers>>
    | MarkerFor<
        Extract<ExhaustiveHandlersExceptions<Handlers>, AnyCraftException>
      >,
    AIn | StripCraftException<ExhaustiveHandlersOutput<Handlers>>,
    unknown
  >;
}

function catchTagImpl(
  code: string,
  handler: HandlerGen,
): (
  program: Generator<unknown, unknown, unknown>,
) => Generator<unknown, unknown, unknown> {
  return (program) =>
    catchWithLookup(program, (thrownCode) =>
      thrownCode === code ? handler : undefined,
    );
}

function catchTagExhaustiveImpl(
  handlers: Record<string, HandlerGen>,
): (
  program: Generator<unknown, unknown, unknown>,
) => Generator<unknown, unknown, unknown> {
  return (program) =>
    // An unknown code (outside the typed union) finds no handler and is
    // rethrown — the safety net for exceptions that escaped the types.
    catchWithLookup(program, (thrownCode) => handlers[thrownCode]);
}

export const catchTag: CatchTagOperator = Object.assign(
  catchTagImpl as unknown as CatchTagOperator,
  {
    exhaustive: catchTagExhaustiveImpl,
  },
) as CatchTagOperator;

/**
 * Retry policy for {@link retry}:
 * - `times` — maximum number of *re*-executions after the initial attempt;
 * - `while` — only retry these exception codes (all when omitted);
 * - `backoff`/`delayMs` — wait between attempts: `delayMs` flat (`'none'`,
 *   the default), `delayMs * attempt` (`'linear'`) or `delayMs * 2^(attempt-1)`
 *   (`'exponential'`). No wait when `delayMs` is omitted.
 */
export type CraftRetryPolicy = {
  times: number;
  while?: string[];
  backoff?: 'none' | 'linear' | 'exponential';
  delayMs?: number;
  schedule?: CraftTemporalSchedule;
};

function retrySchedule(policy: CraftRetryPolicy): CraftTemporalSchedule {
  if (policy.schedule) return policy.schedule;
  const base = policy.delayMs ?? 0;
  if (policy.backoff === 'exponential') {
    return exponentialTemporalSchedule(base, { maxAttempts: policy.times });
  }
  return {
    next: ({ attempt }) =>
      attempt > policy.times
        ? { done: true }
        : {
            done: false,
            delayMs: policy.backoff === 'linear' ? base * attempt : base,
          },
  };
}

function delayAwaitRequest(delayMs: number): RuntimeTemporalAwaitRequest {
  return Object.assign(createTemporalSleepRequest(delayMs), {
    [GUARD_AWAIT_REQUEST_MARKER]: true,
    kind: 'promise' as const,
    value: Promise.resolve(),
  }) as unknown as RuntimeTemporalAwaitRequest & RuntimeGuardAwaitRequest;
}

/**
 * Re-executes the program when it fails with a matched `craftException`, up to
 * `policy.times` extra attempts, then rethrows. Each re-execution replays the
 * whole upstream `.pipe` chain from the source invocation.
 *
 * A non-zero backoff suspends between attempts through an await-request, so it
 * needs an async driver (a route chain or a primitive loader) — in a purely
 * synchronous context (`craftUse`, live guard re-check) the suspension raises
 * the driver's usual await-not-supported/pending behaviour.
 */
export function retry(
  policy: CraftRetryPolicy,
): <YIn, AIn>(
  program: Generator<YIn, AIn, unknown>,
) => Generator<YIn | RuntimeTemporalAwaitRequest, AIn, unknown> {
  return <YIn, AIn>(program: Generator<YIn, AIn, unknown>) =>
    (function* (): Generator<YIn | RuntimeTemporalAwaitRequest, AIn, unknown> {
      let attempt = 0;
      const schedule = retrySchedule(policy);
      let current: Generator<YIn, AIn, unknown> = program;

      for (;;) {
        try {
          return yield* current;
        } catch (error) {
          if (!isCraftGenShortCircuit(error)) {
            throw error;
          }

          if (policy.while && !policy.while.includes(error.exception.code)) {
            throw error;
          }

          if (attempt >= policy.times) {
            throw error;
          }

          const recreate = ɵgetCraftProgramRecreate(program);

          if (!recreate) {
            throw new Error(RETRY_REQUIRES_PROGRAM_ERROR_MESSAGE);
          }

          attempt += 1;

          const decision = schedule.next({
            attempt,
            elapsedMs: 0,
            error: error.exception,
          });
          if (decision.done) throw error;
          const delayMs = decision.delayMs;

          if (delayMs > 0) {
            yield delayAwaitRequest(delayMs) as never;
          }

          current = recreate() as Generator<YIn, AIn, unknown>;
        }
      }
    })();
}
