import type { AnyCraftException } from '@craft-ts/core';
import type { Effect } from 'effect';

// ---------------------------------------------------------------------------
// Task 3.4 — reading a craft program as an Effect signature.
//
// This is a PROJECTION and nothing else: it changes no runtime behaviour and is
// not used by the bridge. Its only job is to make a craft generator's contract
// legible to someone who reads Effect, in docs and in hover tooltips, where
// `Generator<CraftGenExceptionMarker<...> | ..., User, unknown>` is unreadable
// and `Effect<User, UserNotFound>` is not.
// ---------------------------------------------------------------------------

/** The exceptions a craft generator advertises through its yielded markers. */
export type CraftProgramExceptions<Program> = Program extends (
  ...args: never[]
) => Generator<infer Yielded, unknown, unknown>
  ? Extract<Yielded, AnyCraftException>
  : Program extends Generator<infer Yielded, unknown, unknown>
    ? Extract<Yielded, AnyCraftException>
    : never;

/** What a craft generator returns. */
export type CraftProgramSuccess<Program> = Program extends (
  ...args: never[]
) => Generator<unknown, infer Return, unknown>
  ? Return
  : Program extends Generator<unknown, infer Return, unknown>
    ? Return
    : never;

/**
 * Projects a craft program onto `Effect<A, E>`.
 *
 * @example
 * // hover shows Effect<User, UserNotFoundException>
 * type LoadUser = AsEffect<typeof loadUserProgram>;
 */
export type AsEffect<Program> = Effect.Effect<
  CraftProgramSuccess<Program>,
  CraftProgramExceptions<Program>
>;
