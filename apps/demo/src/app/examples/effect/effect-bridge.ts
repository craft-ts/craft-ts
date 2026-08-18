// ---------------------------------------------------------------------------
// ɵ WAVE-0 EFFECT PROTOTYPE — THROWAWAY (plan task 0.1).
//
// This is app-level code on purpose. It is the shape `@craft-ts/effect` will
// have in wave 2: the app installs the bridge, `@craft-ts/core` never learns
// what `effect` is. Everything below is ~40 lines — that is the whole runtime
// cost of speaking Effect.
// ---------------------------------------------------------------------------

import { Cause, Effect, Exit, Option } from 'effect';
import {
  craftException,
  ɵsetForeignYieldBridge,
  type ForeignYieldOutcome,
} from '@craft-ts/core';

/** One line of the trace panel: what the pump did, step by step. */
export type EffectTraceEntry = {
  readonly id: number;
  readonly label: string;
  readonly detail: string;
};

let trace: EffectTraceEntry[] = [];
let nextId = 0;
let listener: ((entries: readonly EffectTraceEntry[]) => void) | undefined;

function push(label: string, detail: string): void {
  trace = [...trace, { id: nextId++, label, detail }];
  listener?.(trace);
}

export function resetEffectTrace(): void {
  trace = [];
  listener?.(trace);
}

export function onEffectTrace(
  next: (entries: readonly EffectTraceEntry[]) => void,
): void {
  listener = next;
}

/**
 * Installs the bridge. Channel mapping:
 * - success           → the pump resumes the generator with the value;
 * - typed failure `E` → a craft exception tagged with the Effect error's `_tag`;
 * - defect (`die`)    → rethrown, so it lands on the *error* channel and can
 *   never be caught by `handleExceptions`.
 */
export function installEffectBridge(): () => void {
  return ɵsetForeignYieldBridge((yielded) => {
    // Effect v4 yields the Effect ITSELF (v3 wrapped it in a `YieldWrap` whose
    // payload sat in a #private field). Structural detection is enough now.
    if (!Effect.isEffect(yielded)) {
      return undefined;
    }

    push(
      '1 · YIELD',
      'the loader yielded an Effect — the pump suspends on the existing "promise" await path',
    );

    // `isEffect` only narrows to `Effect<unknown, unknown, unknown>` while
    // `runPromiseExit` demands `R = never`. Finding 0.1-a: by the time we hold
    // the Effect it is too late to check requirements — that check belongs at
    // the yield site (plan task 2.5).
    const runnable = yielded as Effect.Effect<unknown, unknown, never>;

    return Effect.runPromiseExit(runnable).then(
      (exit): ForeignYieldOutcome => {
        if (Exit.isSuccess(exit)) {
          push(
            '2 · RESUME',
            `Exit.Success — the generator resumes with ${format(exit.value)}, query resolves`,
          );
          return { kind: 'value', value: exit.value };
        }

        const failure = Cause.findErrorOption(exit.cause);
        if (Option.isNone(failure)) {
          push(
            '2 · DEFECT',
            'Cause.Die — not a business exception: rethrown onto the error channel, invisible to handleExceptions',
          );
          throw Cause.squash(exit.cause);
        }

        const error = failure.value;
        const tag = effectErrorTag(error);
        push(
          '2 · SHORT-CIRCUIT',
          `Cause.Fail "${tag}" — mapped to a craft exception, query settles on status "exception"`,
        );

        return {
          kind: 'exception',
          // Effect discriminates on `_tag`, craft still on `code`. This single
          // line is the concrete argument for plan task 1.1; once craft moves
          // to `_tag` the mapping becomes the identity.
          exception: craftException({ code: tag, scope: 'loader' }, error),
        };
      },
    );
  });
}

function effectErrorTag(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    typeof error._tag === 'string'
  ) {
    return error._tag;
  }
  return 'EffectFailure';
}

function format(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
